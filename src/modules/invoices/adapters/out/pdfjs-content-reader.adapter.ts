import jsqrModule from "jsqr";
import { pdf as pdfToImg } from "pdf-to-img";
import type { PdfContentReaderPort } from "../../domain/ports/out/pdf-content-reader.port.js";
import type { PdfContent, PdfWord } from "../../domain/entities/invoice-reading.js";
import type { BarcodeState } from "../../domain/entities/payment-document.js";
import { scanCode128 } from "./barcode/code128.js";

/**
 * Lê o PDF localmente: texto nativo com posições (pdfjs, já trazido pelo `pdf-parse`)
 * e QR codes (jsqr) — primeiro nas imagens incorporadas; só se não houver QR
 * fiscal assim, rasteriza as páginas e procura por janelas (QR em vetor, noutra
 * página que não a 1.ª, ou vários no mesmo documento). Nada sai do servidor.
 */

type ImageData = { width: number; height: number; data: Uint8Array | Uint8ClampedArray; kind?: number };
type JsQr = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst" },
) => { data: string } | null;

// jsqr é CommonJS com `exports.default`: em ESM o default chega embrulhado.
const jsqrExport = jsqrModule as unknown as JsQr | { default: JsQr };
const jsQR: JsQr = typeof jsqrExport === "function" ? jsqrExport : jsqrExport.default;

const MAX_PAGES = 30;
const IMAGE_TIMEOUT_MS = 1500;
/** Páginas rasterizadas à procura de QR em vetor (documentos de pagamento trazem as faturas no fim). */
const MAX_RASTER_PAGES = 4;
/**
 * Escalas tentadas por ordem: numa página inteira o jsqr perde-se com tabelas e logótipos à volta,
 * e cada escala falha em documentos diferentes (ex.: documento de pagamento das águas lê a 2 e a 4,
 * não a 3) — por isso janelas e mais de uma escala.
 */
const RASTER_SCALES = [2, 4] as const;

function toRgba(img: ImageData): Uint8ClampedArray {
  const { width: w, height: h, data, kind } = img;
  if (kind === 3 || data.length === w * h * 4) return new Uint8ClampedArray(data);
  const out = new Uint8ClampedArray(w * h * 4);
  if (kind === 2 || data.length === w * h * 3) {
    for (let i = 0, j = 0; i < w * h; i++) {
      out[j++] = data[i * 3]!;
      out[j++] = data[i * 3 + 1]!;
      out[j++] = data[i * 3 + 2]!;
      out[j++] = 255;
    }
    return out;
  }
  // 1 bit por pixel (kind 1)
  const rowBytes = (w + 7) >> 3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = (data[y * rowBytes + (x >> 3)]! >> (7 - (x & 7))) & 1 ? 255 : 0;
      const j = (y * w + x) * 4;
      out[j] = out[j + 1] = out[j + 2] = v;
      out[j + 3] = 255;
    }
  }
  return out;
}

/** Imagens pequenas: ampliar com margem branca (o jsqr precisa de zona de silêncio e módulos com vários pixels). */
function upscale(rgba: Uint8ClampedArray, w: number, h: number, s: number, pad: number) {
  const W = w * s + pad * 2;
  const H = h * s + pad * 2;
  const out = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let y = 0; y < h * s; y++) {
    for (let x = 0; x < w * s; x++) {
      const a = (((y / s) | 0) * w + ((x / s) | 0)) * 4;
      const b = ((y + pad) * W + x + pad) * 4;
      out[b] = rgba[a]!;
      out[b + 1] = rgba[a + 1]!;
      out[b + 2] = rgba[a + 2]!;
    }
  }
  return { data: out, width: W, height: H };
}

/** Imagem só a preto e branco (códigos 2D): > 95% dos píxeis quase pretos ou quase brancos. */
function isTwoTone(img: ImageData): boolean {
  const rgba = toRgba(img);
  let mono = 0;
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) {
    const l = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!;
    if (l < 40 || l > 215) mono++;
  }
  return mono / n > 0.95;
}

function decodeQr(img: ImageData): string | null {
  if (img.width < 21 || img.height < 21 || img.width * img.height > 16_000_000) return null;
  const rgba = toRgba(img);
  const direct = jsQR(rgba, img.width, img.height);
  if (direct) return direct.data;
  if (img.width > 600) return null;
  const big = upscale(rgba, img.width, img.height, 4, 16);
  return jsQR(big.data, big.width, big.height)?.data ?? null;
}

export class PdfjsContentReaderAdapter implements PdfContentReaderPort {
  async read(fileBuffer: Buffer, mimeType: string): Promise<PdfContent | null> {
    if (mimeType !== "application/pdf") return null;
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    let doc;
    try {
      doc = await pdfjs.getDocument({ data: new Uint8Array(fileBuffer), verbosity: 0, isEvalSupported: false }).promise;
    } catch {
      return null;
    }
    try {
      const content: PdfContent = { pages: [], qrCodes: [] };
      // A mesma imagem pode ser pintada várias vezes (e em várias páginas): lê-se uma vez.
      const seenImages = new Set<string>();
      for (let p = 1; p <= Math.min(doc.numPages, MAX_PAGES); p++) {
        const page = await doc.getPage(p);
        const viewport = page.getViewport({ scale: 1 });
        const words: PdfWord[] = [];
        const text = await page.getTextContent();
        for (const item of text.items) {
          if (!("str" in item) || !item.str.trim()) continue;
          const [, b, c, , x0, y] = item.transform as number[];
          const charWidth = item.str.length ? item.width / item.str.length : 0;
          // Texto rodado (rótulo vertical na margem): marcado para os leitores de linhas o ignorarem.
          const rotated = Math.abs(b!) > 1e-6 || Math.abs(c!) > 1e-6;
          // Um item pode trazer várias palavras ("0 D", "+ 165632"): separar com a posição de cada uma.
          for (const m of item.str.matchAll(/\S+/g)) {
            words.push({ text: m[0], x: x0! + m.index! * charWidth, y: y!, width: m[0].length * charWidth, ...(rotated && { rotated: true }) });
          }
        }
        content.pages.push({ number: p, width: viewport.width, height: viewport.height, words });

        const ops = await page.getOperatorList();
        for (let i = 0; i < ops.fnArray.length; i++) {
          if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
          const name = ops.argsArray[i][0] as string;
          if (seenImages.has(name)) continue;
          seenImages.add(name);
          // Imagens partilhadas entre páginas («g_…») vivem em `commonObjs`, não em `objs` da página:
          // procurá-las no sítio errado esperava IMAGE_TIMEOUT_MS por cada uma (documento de pagamento
          // das águas: ~15 ícones → ~22 s, acima do limite da leitura local → caía na IA sem QR).
          const store = name.startsWith("g_") ? page.commonObjs : page.objs;
          // Algumas imagens nunca chegam a ser resolvidas pelo pdfjs: sem limite, a leitura ficava pendurada.
          const img = await new Promise<ImageData | null>((resolve) => {
            const timer = setTimeout(() => resolve(null), IMAGE_TIMEOUT_MS);
            try {
              store.get(name, (v: ImageData | null) => {
                clearTimeout(timer);
                resolve(v);
              });
            } catch {
              clearTimeout(timer);
              resolve(null);
            }
          });
          const qr = img ? decodeQr(img) : null;
          if (qr) content.qrCodes.push({ page: p, text: qr });
        }
      }
      if (!content.qrCodes.some((q) => q.text.startsWith("A:"))) {
        content.qrCodes.push(...(await this.qrsFromRenderedPages(fileBuffer)));
      }
      return content;
    } finally {
      await doc.destroy().catch(() => undefined);
    }
  }

  /**
   * CODE128 (raster ou vetorial): rasteriza página a página em resolução
   * progressiva — 2× e 3×; 4× só se o código estiver visível mas ilegível.
   */
  async readBarcode(fileBuffer: Buffer, maxPages: number): Promise<BarcodeState> {
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    let unreadablePage: number | null = null;
    const scanAt = async (scale: number): Promise<BarcodeState[]> => {
      const out: BarcodeState[] = [];
      let page = 0;
      for await (const png of await pdfToImg(fileBuffer, { scale })) {
        if (++page > maxPages) break;
        const image = await loadImage(png as Buffer);
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        const { data, width, height } = ctx.getImageData(0, 0, image.width, image.height);
        const scan = scanCode128(data, width, height);
        if (scan.status === "decoded") return [{ status: "decoded", symbology: "CODE128", payload: scan.payload, page }];
        if (scan.status === "unreadable") out.push({ status: "unreadable", page });
      }
      return out;
    };
    try {
      for (const scale of [2, 3, 4]) {
        if (scale === 4 && unreadablePage === null) break;
        const found = await scanAt(scale);
        const decoded = found.find((f) => f.status === "decoded");
        if (decoded) return decoded;
        const unreadable = found.find((f) => f.status === "unreadable");
        if (unreadable && unreadable.status === "unreadable") unreadablePage = unreadable.page;
      }
    } catch {
      // Falha a rasterizar: os campos continuam a vir do texto.
    }
    return unreadablePage !== null ? { status: "unreadable", page: unreadablePage } : { status: "absent" };
  }

  /**
   * Logótipo provável do emitente na 1.ª página: imagens incorporadas com a posição real (matriz de
   * transformação do PDF), no topo da página, de tamanho razoável, que não sejam QR/códigos 2D nem
   * fundos de página; preferência pelo lado esquerdo. PNG com o lado maior ≤ 256 px.
   */
  async extractLogo(fileBuffer: Buffer): Promise<{ png: Buffer; width: number; height: number } | null> {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    let doc;
    try {
      doc = await pdfjs.getDocument({ data: new Uint8Array(fileBuffer), verbosity: 0, isEvalSupported: false }).promise;
    } catch {
      return null;
    }
    try {
      const page = await doc.getPage(1);
      const { width: W, height: H } = page.getViewport({ scale: 1 });
      const ops = await page.getOperatorList();
      type M = [number, number, number, number, number, number];
      const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
      let ctm: M = [1, 0, 0, 1, 0, 0];
      const stack: M[] = [];
      let best: { img: ImageData; score: number } | null = null;
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        const args = ops.argsArray[i] as unknown[];
        if (fn === pdfjs.OPS.save) stack.push(ctm);
        else if (fn === pdfjs.OPS.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
        else if (fn === pdfjs.OPS.transform) ctm = mul(ctm, args as M);
        else if (fn === pdfjs.OPS.paintFormXObjectBegin) { stack.push(ctm); if (Array.isArray(args[0])) ctm = mul(ctm, args[0] as M); }
        else if (fn === pdfjs.OPS.paintFormXObjectEnd) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
        else if (fn === pdfjs.OPS.paintImageXObject) {
          // Quadrado unitário da imagem → retângulo na página.
          const xs = [ctm[4], ctm[4] + ctm[0], ctm[4] + ctm[2], ctm[4] + ctm[0] + ctm[2]];
          const ys = [ctm[5], ctm[5] + ctm[1], ctm[5] + ctm[3], ctm[5] + ctm[1] + ctm[3]];
          const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
          if (w < 30 || h < 15 || w > W * 0.6 || h > H * 0.3 || y + h < H * 0.6) continue;
          const aspect = w / h;
          if (aspect < 0.33 || aspect > 8) continue;
          const name = args[0] as string;
          const img = await new Promise<ImageData | null>((resolve) => {
            const timer = setTimeout(() => resolve(null), IMAGE_TIMEOUT_MS);
            try {
              page.objs.get(name, (v: ImageData | null) => { clearTimeout(timer); resolve(v); });
            } catch {
              clearTimeout(timer);
              resolve(null);
            }
          });
          if (!img || img.width < 24 || img.height < 12 || decodeQr(img)) continue;
          if (aspect > 0.8 && aspect < 1.25 && isTwoTone(img)) continue; // DataMatrix e afins
          const score = w * h * (x + w / 2 < W / 2 ? 1.3 : 1);
          if (!best || score > best.score) best = { img, score };
        }
      }
      if (!best) return null;
      const { createCanvas } = await import("@napi-rs/canvas");
      const src = createCanvas(best.img.width, best.img.height);
      const sctx = src.getContext("2d");
      const data = sctx.createImageData(best.img.width, best.img.height);
      data.data.set(toRgba(best.img));
      sctx.putImageData(data, 0, 0);
      const k = Math.min(1, 256 / Math.max(best.img.width, best.img.height));
      const out = createCanvas(Math.max(1, Math.round(best.img.width * k)), Math.max(1, Math.round(best.img.height * k)));
      out.getContext("2d").drawImage(src, 0, 0, out.width, out.height);
      return { png: out.toBuffer("image/png"), width: out.width, height: out.height };
    } catch {
      return null;
    } finally {
      await doc.destroy().catch(() => undefined);
    }
  }

  /**
   * QR desenhado em vetor (sem imagem): rasteriza até MAX_RASTER_PAGES páginas e procura em janelas
   * sobrepostas (½ da largura × ⅓ da altura, passo de metade) — cada janela tem um só QR e pouco
   * ruído à volta, e assim apanham-se vários QR na mesma página. Para na primeira escala que encontre
   * QR fiscais; devolve-os sem repetidos, pela ordem da página (cima → baixo, esquerda → direita).
   */
  private async qrsFromRenderedPages(buffer: Buffer): Promise<{ page: number; text: string }[]> {
    try {
      const { createCanvas, loadImage } = await import("@napi-rs/canvas");
      for (const scale of RASTER_SCALES) {
        const found: { page: number; text: string }[] = [];
        let page = 0;
        for await (const png of await pdfToImg(buffer, { scale })) {
          if (++page > MAX_RASTER_PAGES) break;
          const image = await loadImage(png as Buffer);
          const { width: W, height: H } = image;
          const canvas = createCanvas(W, H);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(image, 0, 0);
          const tw = Math.round(W / 2);
          const th = Math.round(H / 3);
          for (let y = 0; y < H; y += Math.round(th / 2)) {
            for (let x = 0; x < W; x += Math.round(tw / 2)) {
              const w = Math.min(tw, W - x);
              const h = Math.min(th, H - y);
              if (w < 21 || h < 21) continue;
              const { data } = ctx.getImageData(x, y, w, h);
              const text = jsQR(data, w, h, { inversionAttempts: "dontInvert" })?.data;
              if (text && !found.some((q) => q.text === text)) found.push({ page, text });
            }
          }
        }
        if (found.some((q) => q.text.startsWith("A:"))) return found;
      }
    } catch (e) {
      // Não silenciar: sem isto, uma rasterização a falhar no servidor só se via como «lida pela IA».
      console.error("[invoices] rasterização para procurar QR falhou:", e instanceof Error ? e.message : e);
      return [];
    }
    return [];
  }
}

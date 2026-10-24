import jsqrModule from "jsqr";
import { pdf as pdfToImg } from "pdf-to-img";
import type { PdfContentReaderPort } from "../../domain/ports/out/pdf-content-reader.port.js";
import type { PdfContent, PdfWord } from "../../domain/entities/invoice-reading.js";

/**
 * Lê o PDF localmente: texto nativo com posições (pdfjs, já trazido pelo `pdf-parse`)
 * e QR codes (jsqr) — primeiro nas imagens incorporadas; só se não houver QR
 * fiscal assim, rasteriza a 1.ª página. Nada sai do servidor.
 */

type ImageData = { width: number; height: number; data: Uint8Array | Uint8ClampedArray; kind?: number };
type JsQr = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;

// jsqr é CommonJS com `exports.default`: em ESM o default chega embrulhado.
const jsqrExport = jsqrModule as unknown as JsQr | { default: JsQr };
const jsQR: JsQr = typeof jsqrExport === "function" ? jsqrExport : jsqrExport.default;

const MAX_PAGES = 30;

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
      for (let p = 1; p <= Math.min(doc.numPages, MAX_PAGES); p++) {
        const page = await doc.getPage(p);
        const viewport = page.getViewport({ scale: 1 });
        const words: PdfWord[] = [];
        const text = await page.getTextContent();
        for (const item of text.items) {
          if (!("str" in item) || !item.str.trim()) continue;
          const [, , , , x0, y] = item.transform as number[];
          const charWidth = item.str.length ? item.width / item.str.length : 0;
          // Um item pode trazer várias palavras ("0 D", "+ 165632"): separar com a posição de cada uma.
          for (const m of item.str.matchAll(/\S+/g)) words.push({ text: m[0], x: x0! + m.index! * charWidth, y: y!, width: m[0].length * charWidth });
        }
        content.pages.push({ number: p, width: viewport.width, height: viewport.height, words });

        const ops = await page.getOperatorList();
        for (let i = 0; i < ops.fnArray.length; i++) {
          if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
          const name = ops.argsArray[i][0] as string;
          const img = await new Promise<ImageData | null>((resolve) => {
            try {
              page.objs.get(name, (v: ImageData | null) => resolve(v));
            } catch {
              resolve(null);
            }
          });
          const qr = img ? decodeQr(img) : null;
          if (qr) content.qrCodes.push({ page: p, text: qr });
        }
      }
      if (!content.qrCodes.some((q) => q.text.startsWith("A:"))) {
        const rendered = await this.qrFromRenderedFirstPage(fileBuffer);
        if (rendered) content.qrCodes.push({ page: 1, text: rendered });
      }
      return content;
    } finally {
      await doc.destroy().catch(() => undefined);
    }
  }

  /** QR desenhado em vetor (sem imagem): rasterizar só a 1.ª página. */
  private async qrFromRenderedFirstPage(buffer: Buffer): Promise<string | null> {
    try {
      const { createCanvas, loadImage } = await import("@napi-rs/canvas");
      for await (const png of await pdfToImg(buffer, { scale: 3 })) {
        const image = await loadImage(png as Buffer);
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        const { data, width, height } = ctx.getImageData(0, 0, image.width, image.height);
        return jsQR(data, width, height)?.data ?? null;
      }
    } catch {
      return null;
    }
    return null;
  }
}

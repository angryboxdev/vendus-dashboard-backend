import { ENV } from "../config/env.js";
/**
 * Extração estruturada de faturas de fornecedor via OpenAI (texto ou visão).
 */
import OpenAI from "openai";
import { PDFParse } from "pdf-parse";
import { pdf as pdfToImg } from "pdf-to-img";
import { z } from "zod";

function parseLocaleNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).replace(/\s/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const LineSchema = z
  .object({
    description: z
      .union([z.string(), z.number()])
      .optional()
      .transform((v) => {
        if (v == null) return "(sem descrição)";
        const s = String(v).trim();
        return s || "(sem descrição)";
      }),
    supplier_article_code: z
      .union([z.string(), z.number()])
      .nullable()
      .optional()
      .transform((v) => {
        if (v == null || v === "") return null;
        return String(v).trim() || null;
      }),
    quantity: z.union([z.number(), z.string()]).transform((v) => {
      const n = parseLocaleNumber(v);
      return n != null && n > 0 ? n : 1;
    }),
    unit: z
      .union([z.string(), z.number()])
      .nullable()
      .optional()
      .transform((v) => (v == null || v === "" ? null : String(v).trim())),
    unit_price_net: z
      .union([z.number(), z.string(), z.null()])
      .optional()
      .transform((v) => parseLocaleNumber(v)),
    unit_price_gross: z
      .union([z.number(), z.string(), z.null()])
      .optional()
      .transform((v) => parseLocaleNumber(v)),
    vat_rate: z
      .union([z.number(), z.string(), z.null()])
      .optional()
      .transform((v) => parseLocaleNumber(v)),
    // Desconto total combinado (ex.: 10 para 10%, 0.10 para 10%). Nulo se sem desconto.
    discount_pct: z
      .union([z.number(), z.string(), z.null()])
      .optional()
      .transform((v) => parseLocaleNumber(v)),
    line_total_net: z
      .union([z.number(), z.string(), z.null()])
      .optional()
      .transform((v) => parseLocaleNumber(v)),
    line_total_gross: z
      .union([z.number(), z.string(), z.null()])
      .optional()
      .transform((v) => parseLocaleNumber(v)),
  })
  .passthrough();

const ExtractSchema = z.object({
  supplier_name: z.string().nullable().optional(),
  invoice_number: z.string().nullable().optional(),
  invoice_date: z.string().nullable().optional(),
  currency: z.string().optional().default("EUR"),
  lines: z.array(LineSchema).default([]),
  subtotal: z.number().nullable().optional(),
  tax_total: z.number().nullable().optional(),
  total: z.number().nullable().optional(),
});

export type InvoiceExtractResult = z.infer<typeof ExtractSchema>;
export type InvoiceExtractLine = z.infer<typeof LineSchema>;

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundMoney4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function nearlyEqual(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

/**
 * Normaliza desconto para decimal (0.10). Aceita 10, 10.0, 0.10.
 * Devolve null se nulo, zero ou inválido.
 */
function normalizeDiscountToDecimal(d: number | null | undefined): number | null {
  if (d == null || !Number.isFinite(d) || d <= 0) return null;
  if (d <= 1) return d;
  if (d <= 100) return d / 100;
  return null;
}

/**
 * Converte IVA para taxa decimal (0.23). Aceita 23, 0.23, ou 6 (IVA intermédio).
 */
export function normalizeVatRateToDecimal(
  rate: number | null | undefined,
): number | null {
  if (rate == null || !Number.isFinite(rate)) return null;
  if (rate >= 0 && rate <= 1) return rate;
  if (rate > 1 && rate <= 100) return rate / 100;
  return null;
}

/**
 * Corrige bruto/líquido quando o modelo copia o mesmo valor para ambos com IVA > 0.
 * Recalcula totais de linha a partir de qty × unit quando o total copiou o preço unitário.
 */
export function normalizeExtractedInvoiceAmounts(
  result: InvoiceExtractResult,
): void {
  for (const line of result.lines) {
    // ── Discount correction ──────────────────────────────────────────────────
    // The prompt instructs OpenAI to always return the raw P.Unit. column price.
    // We apply the discount here unconditionally when discount_pct is present.
    const discRate = normalizeDiscountToDecimal(line.discount_pct);
    if (discRate != null) {
      line.discount_pct = discRate; // store as decimal for DB
      const netU = line.unit_price_net;
      const q = line.quantity;
      if (netU != null && Number.isFinite(netU)) {
        line.unit_price_net = roundMoney4(netU * (1 - discRate));
        if (line.unit_price_gross != null && Number.isFinite(line.unit_price_gross)) {
          line.unit_price_gross = roundMoney4(line.unit_price_gross * (1 - discRate));
        }
        // Recompute line totals from the discounted unit price
        line.line_total_net = roundMoney2(line.unit_price_net * q);
        if (line.unit_price_gross != null && Number.isFinite(line.unit_price_gross)) {
          line.line_total_gross = roundMoney2(line.unit_price_gross * q);
        }
      }
    }

    // ── Fallback: infer discount from line_total when discount_pct was missed ──
    // If line_total_net was read correctly from the Total column but is less than
    // qty × unit_price_net, the difference implies a discount OpenAI didn't extract.
    if (discRate == null) {
      const netU = line.unit_price_net;
      const netTotal = line.line_total_net;
      const q = line.quantity;
      if (netU != null && Number.isFinite(netU) && netU > 0 &&
          netTotal != null && Number.isFinite(netTotal) && q > 0) {
        const computedTotal = netU * q;
        const tol = computedTotal * 0.01; // 1% tolerance
        if (netTotal < computedTotal - tol) {
          const impliedDisc = 1 - netTotal / computedTotal;
          if (impliedDisc >= 0.005 && impliedDisc <= 0.6) {
            line.discount_pct = Math.round(impliedDisc * 10000) / 10000;
            line.unit_price_net = roundMoney4(netU * (1 - impliedDisc));
            if (line.unit_price_gross != null && Number.isFinite(line.unit_price_gross)) {
              line.unit_price_gross = roundMoney4(line.unit_price_gross * (1 - impliedDisc));
            }
            // line_total_net is already the correct post-discount value — do not change it
          }
        }
      }
    }

    // ── VAT normalization ────────────────────────────────────────────────────
    const rate = normalizeVatRateToDecimal(line.vat_rate);
    if (rate != null && rate >= 0) {
      line.vat_rate = rate;
    }

    if (rate == null || rate <= 0) continue;

    const netU = line.unit_price_net;
    let grossU = line.unit_price_gross;

    if (netU != null && Number.isFinite(netU)) {
      const expectedGross = netU * (1 + rate);
      if (
        grossU == null ||
        !Number.isFinite(grossU) ||
        nearlyEqual(netU, grossU, 0.02) ||
        // Also fix when OpenAI's gross doesn't match net×(1+rate) by more than €0.02
        !nearlyEqual(grossU, expectedGross, 0.02)
      ) {
        line.unit_price_gross = roundMoney4(expectedGross);
        grossU = line.unit_price_gross;
      }
    } else if (grossU != null && Number.isFinite(grossU)) {
      line.unit_price_net = roundMoney4(grossU / (1 + rate));
    }

    const netL = line.line_total_net;
    let grossL = line.line_total_gross;

    if (netL != null && Number.isFinite(netL)) {
      const expectedGrossL = netL * (1 + rate);
      if (
        grossL == null ||
        !Number.isFinite(grossL) ||
        nearlyEqual(netL, grossL, 0.02) ||
        // Also fix when computed gross doesn't match line_total_net×(1+rate) by more than 0.3%
        !nearlyEqual(grossL, expectedGrossL, Math.max(expectedGrossL * 0.003, 0.05))
      ) {
        line.line_total_gross = roundMoney2(expectedGrossL);
        grossL = line.line_total_gross;
      }
    } else if (grossL != null && Number.isFinite(grossL)) {
      line.line_total_net = roundMoney2(grossL / (1 + rate));
    }

    const q = line.quantity;
    const finalNetU = line.unit_price_net;
    const finalGrossU = line.unit_price_gross;
    if (
      q > 1 &&
      finalNetU != null &&
      Number.isFinite(finalNetU) &&
      line.line_total_net != null &&
      Number.isFinite(line.line_total_net) &&
      nearlyEqual(line.line_total_net, finalNetU, 0.02) &&
      !nearlyEqual(line.line_total_net, q * finalNetU, 0.05)
    ) {
      line.line_total_net = roundMoney2(q * finalNetU);
      if (finalGrossU != null && Number.isFinite(finalGrossU)) {
        line.line_total_gross = roundMoney2(q * finalGrossU);
      } else {
        line.line_total_gross = roundMoney2(line.line_total_net * (1 + rate));
      }
    }
  }

  // ── Recompute invoice-level totals from corrected line data ────────────────
  // OpenAI sometimes extracts wrong subtotal/tax/total (pre-discount, computed
  // from wrong unit prices, etc.). We trust the line-level numbers we just fixed.
  const linesWithNet = result.lines.filter(
    (l) => l.line_total_net != null && Number.isFinite(l.line_total_net),
  );
  if (linesWithNet.length === result.lines.length && linesWithNet.length > 0) {
    const computedSubtotal = linesWithNet.reduce((s, l) => s + l.line_total_net!, 0);
    const computedTax = linesWithNet.reduce((s, l) => {
      const vat = l.vat_rate;
      return s + (vat != null ? l.line_total_net! * vat : 0);
    }, 0);
    result.subtotal = roundMoney2(computedSubtotal);
    result.tax_total = roundMoney2(computedTax);
    result.total = roundMoney2(computedSubtotal + computedTax);
  }
}

function requireOpenAI(): OpenAI {
  if (!ENV.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY não definida (necessária para extrair dados da fatura)",
    );
  }
  return new OpenAI({ apiKey: ENV.OPENAI_API_KEY });
}

const SYSTEM_PROMPT = `És um assistente que extrai dados estruturados de faturas de fornecedor (Portugal / EUR).
Responde APENAS com um único objeto JSON válido, sem markdown.

Estrutura OBRIGATÓRIA do JSON:
1) Na raiz do objeto: supplier_name, invoice_number, invoice_date (YYYY-MM-DD), currency (EUR), subtotal, tax_total, total (números ou null).
2) Chave "lines": array com TODAS as linhas de artigos/serviços da tabela da fatura. Se existir tabela de produtos, "lines" NÃO pode ser vazio.

Cada elemento de "lines" deve ter:
- description (texto da descrição do artigo)
- supplier_article_code (código na 1.ª coluna, ex. "019000", ou null)
- quantity (número), unit (ex. "PC", "UN", "KG", ou null)
- unit_price_net (sem IVA), unit_price_gross (com IVA), vat_rate (0.23 ou 23 para 23%)
- line_total_net, line_total_gross
- discount_pct: percentagem de desconto da linha (ex.: 10 para 10%, null se sem desconto). OBRIGATÓRIO verificar se existe coluna Desc., Desconto, Desc.1, Desc.2, ou qualquer valor percentual entre o preço unitário e o total da linha. Se houver dois descontos consecutivos (ex.: 10% e 5%), calcula o combinado: 100 - (90×95/100) = 14.5.
- line_total_net: lê SEMPRE o valor impresso na coluna "Total" da tabela. NUNCA calcules qty×unit_price. Em faturas portuguesas a coluna Total já inclui desconto mas exclui IVA.

REGRAS CRÍTICAS:
1. unit_price_net e unit_price_gross = valor bruto da coluna P.Unit./Preço Unit. (ANTES de descontos).
2. line_total_net = valor impresso na coluna Total (APÓS descontos, ANTES de IVA). NÃO calcules.
3. Se vires uma percentagem entre o preço unitário e o total (ex.: "10,00%"), é um desconto → extrai em discount_pct.

Exemplo de linha com desconto (colunas: Ref | Descrição | Qtd | P.Unit | Desc | Total | Tx IVA):
  44641004 | Q.Mozzarella | 40 | 6,20 | 10,00% | 223,20 | 6,00%
  → quantity=40, unit_price_net=6.20, discount_pct=10, line_total_net=223.20, vat_rate=6

IVA: se vat_rate > 0, unit_price_gross deve ser unit_price_net*(1+taxa); não repitas o mesmo valor nos dois salvo isenção.

Usa ponto ou vírgula nos números; o sistema normaliza.`;

/**
 * Modelos às vezes devolvem "items", "linhas" ou aninham em "invoice"; unifica antes do Zod.
 */
export function coerceOpenAiInvoiceShape(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const o = { ...(raw as Record<string, unknown>) };

  const nested = o.invoice ?? o.document ?? o.fatura;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const n = nested as Record<string, unknown>;
    for (const k of [
      "supplier_name",
      "invoice_number",
      "invoice_date",
      "currency",
      "lines",
      "subtotal",
      "tax_total",
      "total",
    ] as const) {
      if (o[k] == null && n[k] != null) o[k] = n[k];
    }
  }

  if (!Array.isArray(o.lines)) {
    const candidates = [
      o.lines,
      o.items,
      o.line_items,
      o.products,
      o.linhas,
      o.detalhes,
      o.artigos,
      o.rows,
    ];
    for (const c of candidates) {
      if (Array.isArray(c)) {
        o.lines = c;
        break;
      }
    }
  }
  if (!Array.isArray(o.lines)) o.lines = [];

  if (o.supplier_name == null && typeof o.supplier === "string") {
    o.supplier_name = o.supplier;
  }
  if (o.invoice_number == null) {
    if (o.invoice_no != null) o.invoice_number = String(o.invoice_no);
    else if (o.number != null) o.invoice_number = String(o.number);
    else if (o.numero_fatura != null)
      o.invoice_number = String(o.numero_fatura);
  }
  if (o.invoice_date == null && o.date != null) o.invoice_date = String(o.date);

  return o;
}

function parseAndNormalizeExtract(rawJson: string): InvoiceExtractResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch {
    throw new Error("Resposta OpenAI não é JSON válido");
  }
  parsed = coerceOpenAiInvoiceShape(parsed);
  const result = ExtractSchema.parse(parsed);
  normalizeExtractedInvoiceAmounts(result);
  return result;
}

async function extractLinesFallbackFromText(
  invoiceText: string,
): Promise<InvoiceExtractResult["lines"]> {
  const openai = requireOpenAI();
  const completion = await openai.chat.completions.create({
    model: ENV.OPENAI_MODEL_TEXT,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extrai da fatura um JSON com a chave "lines" apenas: array de objetos, um por cada linha da tabela de artigos/produtos.
Cada objeto: description, supplier_article_code (ou null), quantity, unit, unit_price_net, unit_price_gross, vat_rate, line_total_net, line_total_gross.
OBRIGATÓRIO: pelo menos uma linha se a fatura tiver tabela de produtos. Números podem usar vírgula como decimal.`,
      },
      {
        role: "user",
        content: `Texto da fatura:\n\n${invoiceText.slice(0, 120_000)}`,
      },
    ],
    temperature: 0.1,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI (fallback) sem conteúdo");
  const parsed = coerceOpenAiInvoiceShape(JSON.parse(raw) as unknown);
  const only = z
    .object({ lines: z.array(LineSchema).default([]) })
    .parse(parsed);
  const wrap: InvoiceExtractResult = {
    supplier_name: null,
    invoice_number: null,
    invoice_date: null,
    currency: "EUR",
    lines: only.lines as InvoiceExtractResult["lines"],
    subtotal: null,
    tax_total: null,
    total: null,
  };
  normalizeExtractedInvoiceAmounts(wrap);
  return wrap.lines;
}

async function extractFromText(
  invoiceText: string,
): Promise<InvoiceExtractResult> {
  const openai = requireOpenAI();
  const completion = await openai.chat.completions.create({
    model: ENV.OPENAI_MODEL_TEXT,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Texto da fatura:\n\n${invoiceText.slice(0, 120_000)}`,
      },
    ],
    temperature: 0.1,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI não devolveu conteúdo");
  const result = parseAndNormalizeExtract(raw);

  if (result.lines.length === 0 && invoiceText.length > 80) {
    const fallbackLines = await extractLinesFallbackFromText(invoiceText);
    if (fallbackLines.length > 0) {
      result.lines = fallbackLines;
    }
  }

  if (result.lines.length === 0) {
    throw new Error(
      "Nenhuma linha de produto foi extraída. Se o PDF for digitalizado, envia JPG/PNG; se tiver texto, tenta reenviar.",
    );
  }

  return result;
}

async function extractFromImageBase64(
  mime: "image/jpeg" | "image/png" | "image/webp",
  base64: string,
): Promise<InvoiceExtractResult> {
  const openai = requireOpenAI();
  const completion = await openai.chat.completions.create({
    model: ENV.OPENAI_MODEL_VISION,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${mime};base64,${base64}`,
              detail: "high",
            },
          },
          {
            type: "text",
            text: "Extrai os dados desta fatura para o JSON descrito.",
          },
        ],
      },
    ],
    temperature: 0.1,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI não devolveu conteúdo");
  const result = parseAndNormalizeExtract(raw);

  if (result.lines.length === 0) {
    throw new Error(
      "Não foi possível extrair linhas da imagem. Tenta PDF com texto ou foto mais nítida.",
    );
  }

  return result;
}

/** Converte todas as páginas de um PDF digitalizado em PNG base64. */
async function pdfToPageImages(buffer: Buffer): Promise<string[]> {
  const pages: string[] = [];
  for await (const pageBuffer of await pdfToImg(buffer, { scale: 2 })) {
    pages.push((pageBuffer as Buffer).toString("base64"));
  }
  return pages;
}

/** Processa PDF digitalizado convertendo páginas em imagens e enviando ao vision API. */
async function extractFromScannedPdf(buffer: Buffer): Promise<InvoiceExtractResult> {
  const pages = await pdfToPageImages(buffer);
  if (pages.length === 0) {
    throw new Error("Não foi possível converter o PDF em imagem. Tenta enviar como JPG/PNG.");
  }

  const openai = requireOpenAI();
  const imageContent: OpenAI.Chat.ChatCompletionContentPart[] = pages.map((b64) => ({
    type: "image_url" as const,
    image_url: { url: `data:image/png;base64,${b64}`, detail: "high" as const },
  }));
  imageContent.push({ type: "text", text: "Extrai os dados desta fatura para o JSON descrito." });

  const completion = await openai.chat.completions.create({
    model: ENV.OPENAI_MODEL_VISION,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: imageContent },
    ],
    temperature: 0.1,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI não devolveu conteúdo");
  const result = parseAndNormalizeExtract(raw);

  if (result.lines.length === 0) {
    throw new Error("Não foi possível extrair linhas do PDF digitalizado. Tenta uma foto mais nítida.");
  }

  return result;
}

/** Extrai texto de um PDF (buffer). */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return (result.text ?? "").trim();
  } finally {
    await parser.destroy();
  }
}

/**
 * Extrai dados estruturados: PDF com texto, ou imagem (JPEG/PNG/WebP).
 */
export async function extractInvoiceWithOpenAI(options: {
  buffer: Buffer;
  mime: string;
  fileName: string;
}): Promise<InvoiceExtractResult> {
  const { buffer, mime } = options;
  const lower = mime.toLowerCase();

  if (lower === "application/pdf" || lower.endsWith("/pdf")) {
    const text = await extractPdfText(buffer);
    if (text.length < 40) {
      // PDF digitalizado — converte páginas em imagens e processa via vision
      return extractFromScannedPdf(buffer);
    }
    return extractFromText(text);
  }

  if (
    lower === "image/jpeg" ||
    lower === "image/jpg" ||
    lower === "image/png" ||
    lower === "image/webp"
  ) {
    const b64 = buffer.toString("base64");
    const visionMime =
      lower === "image/png"
        ? "image/png"
        : lower === "image/webp"
          ? "image/webp"
          : "image/jpeg";
    return extractFromImageBase64(visionMime, b64);
  }

  throw new Error(
    `Tipo de ficheiro não suportado: ${mime}. Usa PDF (com texto), JPG ou PNG.`,
  );
}

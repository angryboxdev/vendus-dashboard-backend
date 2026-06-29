import OpenAI from "openai";
import type { AiExtractionPort } from "../../domain/ports/out/ai-extraction.port.js";
import type { AiExtractionResult, AiExtractedLine } from "../../domain/entities/ai-extraction-result.js";

const EXTRACTION_PROMPT = `You are a financial document parser. Extract the following fields from this invoice document and return ONLY valid JSON, no markdown, no explanation.

Fields to extract:
- supplierName (string or null)
- supplierNif (string or null) — tax identification number
- supplierAddress (string or null)
- supplierEmail (string or null)
- invoiceNumber (string or null)
- issueDate (string "YYYY-MM-DD" or null)
- dueDate (string "YYYY-MM-DD" or null)
- subtotalWithoutVat (integer in cents, or null) — amount before VAT
- vatAmount (integer in cents, or null) — total VAT
- totalWithVat (integer in cents, or null) — total amount including VAT
- currency (string, e.g. "EUR", or null)
- confidence (number 0.0–1.0) — your confidence in the overall extraction accuracy
- lines (array of objects with: description, quantity, unitPriceWithoutVat, vatRate, vatAmount, totalWithoutVat, totalWithVat — all optional integers in cents except vatRate and quantity which are decimals)
- validationIssues (array of strings for any issues you detected, e.g. "values_unclear", "partial_document", "multiple_pages")

Return JSON only. Example structure:
{
  "supplierName": "Makro Portugal SA",
  "supplierNif": "500123456",
  "supplierAddress": "Av. das Forças Armadas, 1600-079 Lisboa",
  "supplierEmail": null,
  "invoiceNumber": "MKR-2026-0421",
  "issueDate": "2026-06-01",
  "dueDate": "2026-07-01",
  "subtotalWithoutVat": 100000,
  "vatAmount": 23000,
  "totalWithVat": 123000,
  "currency": "EUR",
  "confidence": 0.95,
  "lines": [],
  "validationIssues": []
}`;

interface RawExtractionJson {
  supplierName?: string | null;
  supplierNif?: string | null;
  supplierAddress?: string | null;
  supplierEmail?: string | null;
  invoiceNumber?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  subtotalWithoutVat?: number | null;
  vatAmount?: number | null;
  totalWithVat?: number | null;
  currency?: string | null;
  confidence?: number;
  lines?: Array<{
    description?: string;
    quantity?: number | null;
    unitPriceWithoutVat?: number | null;
    vatRate?: number | null;
    vatAmount?: number | null;
    totalWithoutVat?: number | null;
    totalWithVat?: number | null;
  }>;
  validationIssues?: string[];
}

export class OpenAiExtractionAdapter implements AiExtractionPort {
  private readonly openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async extract(fileBuffer: Buffer, mimeType: string): Promise<AiExtractionResult> {
    const isImage = mimeType.startsWith("image/");
    const isPdf = mimeType === "application/pdf";

    if (!isImage && !isPdf) {
      throw new Error(`Unsupported mimeType for extraction: ${mimeType}`);
    }

    let raw: RawExtractionJson;

    try {
      // Use base64 data URL so OpenAI receives the file directly — no public storage URL needed
      const base64 = fileBuffer.toString("base64");
      const dataUrl = `data:${mimeType};base64,${base64}`;
      raw = await this.extractFromImage(dataUrl, isImage ? mimeType : "image/png");
    } catch (err) {
      return this.failedResult(err instanceof Error ? err.message : "extraction_error");
    }

    return this.parseResult(raw);
  }

  private async extractFromImage(imageUrl: string, mimeType: string): Promise<RawExtractionJson> {
    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: EXTRACTION_PROMPT },
            {
              type: "image_url",
              image_url: { url: imageUrl, detail: "high" },
            },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "";
    const jsonText = text.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(jsonText) as RawExtractionJson;
  }

  private parseResult(raw: RawExtractionJson): AiExtractionResult {
    const lines: AiExtractedLine[] = (raw.lines ?? []).map((l) => ({
      description: l.description ?? "",
      quantity: l.quantity ?? null,
      unitPriceWithoutVat: l.unitPriceWithoutVat ?? null,
      vatRate: l.vatRate ?? null,
      vatAmount: l.vatAmount ?? null,
      totalWithoutVat: l.totalWithoutVat ?? null,
      totalWithVat: l.totalWithVat ?? null,
    }));

    return {
      supplierName: raw.supplierName ?? null,
      supplierNif: raw.supplierNif ?? null,
      supplierAddress: raw.supplierAddress ?? null,
      supplierEmail: raw.supplierEmail ?? null,
      invoiceNumber: raw.invoiceNumber ?? null,
      issueDate: raw.issueDate ? new Date(raw.issueDate) : null,
      dueDate: raw.dueDate ? new Date(raw.dueDate) : null,
      subtotalWithoutVat: raw.subtotalWithoutVat ?? null,
      vatAmount: raw.vatAmount ?? null,
      totalWithVat: raw.totalWithVat ?? null,
      currency: raw.currency ?? null,
      confidence: typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5,
      lines,
      validationIssues: raw.validationIssues ?? [],
    };
  }

  private failedResult(issue: string): AiExtractionResult {
    return {
      supplierName: null,
      supplierNif: null,
      supplierAddress: null,
      supplierEmail: null,
      invoiceNumber: null,
      issueDate: null,
      dueDate: null,
      subtotalWithoutVat: null,
      vatAmount: null,
      totalWithVat: null,
      currency: null,
      confidence: 0,
      lines: [],
      validationIssues: [issue],
    };
  }
}

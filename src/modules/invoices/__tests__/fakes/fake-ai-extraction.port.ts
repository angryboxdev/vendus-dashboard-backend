import type { AiExtractionPort } from "../../domain/ports/out/ai-extraction.port.js";
import type { AiExtractionResult } from "../../domain/entities/ai-extraction-result.js";

export class FakeAiExtractionPort implements AiExtractionPort {
  private result: AiExtractionResult = {
    supplierName: "Makro Portugal SA",
    supplierNif: "500123456",
    supplierAddress: "Av. das Forças Armadas, Lisboa",
    supplierEmail: null,
    invoiceNumber: "INV-2026-001",
    issueDate: new Date("2026-06-01"),
    dueDate: new Date("2026-07-01"),
    subtotalWithoutVat: 100000,
    vatAmount: 23000,
    totalWithVat: 123000,
    currency: "EUR",
    confidence: 0.92,
    lines: [],
    validationIssues: [],
  };

  setResult(result: Partial<AiExtractionResult>): void {
    this.result = { ...this.result, ...result };
  }

  async extract(_fileBuffer: Buffer, _mimeType: string): Promise<AiExtractionResult> {
    return this.result;
  }
}

import { describe, it, expect } from "@jest/globals";
import { ReadStatementPdfUseCase } from "../../application/use-cases/read-statement-pdf.use-case.js";
import { StatementPdfNotRecognizedError } from "../../domain/errors.js";
import type { PdfDocumentText } from "../../domain/services/statement-pdf/pdf-text.js";

const port = (doc: PdfDocumentText | null) => ({ extract: async () => doc });

describe("ReadStatementPdfUseCase", () => {
  it("PDF ilegível → erro claro", async () => {
    await expect(new ReadStatementPdfUseCase(port(null)).execute(Buffer.from("x"))).rejects.toThrow(StatementPdfNotRecognizedError);
  });

  it("PDF de um layout desconhecido → erro que diz o que é suportado", async () => {
    const uc = new ReadStatementPdfUseCase(port({ pages: [[{ x: 50, y: 700, str: "Extrato de outro banco" }]] }));
    await expect(uc.execute(Buffer.from("x"))).rejects.toThrow(/Millennium BCP/);
  });
});

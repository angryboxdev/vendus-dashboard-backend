import type { StatementPdfTextPort } from "../../domain/ports/out/statement-pdf-text.port.js";
import type { ParsedBankStatement } from "../../domain/services/statement-pdf/parsed-statement.js";
import { parseStatementPdf } from "../../domain/services/statement-pdf/statement-pdf-registry.js";
import { StatementPdfNotRecognizedError } from "../../domain/errors.js";
import type { ReadStatementPdfPort } from "../../domain/ports/in/statement-pdf.ports.js";

/** Lê um extrato em PDF de um modelo reconhecido (hoje: Millennium BCP). Sem gravar nada. */
export class ReadStatementPdfUseCase implements ReadStatementPdfPort {
  constructor(private readonly pdfText: StatementPdfTextPort) {}

  async execute(fileBuffer: Buffer): Promise<ParsedBankStatement> {
    const doc = await this.pdfText.extract(fileBuffer);
    if (!doc) throw new StatementPdfNotRecognizedError("Não foi possível ler o PDF (ficheiro danificado ou protegido).");
    const parsed = parseStatementPdf(doc);
    if (!parsed) {
      throw new StatementPdfNotRecognizedError(
        "Este PDF não corresponde a nenhum modelo de extrato conhecido. Por agora é suportado o «Extrato Combinado» do Millennium BCP; para outros bancos importe o CSV ou XLSX.",
      );
    }
    return parsed;
  }
}

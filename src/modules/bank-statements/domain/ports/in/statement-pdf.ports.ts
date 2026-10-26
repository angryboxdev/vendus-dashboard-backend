import type { ParsedBankStatement } from "../../services/statement-pdf/parsed-statement.js";

/** Lê um extrato em PDF de um modelo reconhecido (hoje: Millennium BCP), sem gravar nada. */
export interface ReadStatementPdfPort {
  execute(fileBuffer: Buffer): Promise<ParsedBankStatement>;
}

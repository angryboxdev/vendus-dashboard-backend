import type { SaftFile, SalesDeclarationFile } from "../../entities/sales-declaration.js";

export interface GenerateSalesDeclarationInput {
  /** Um ou mais SAF-T (ex.: o do Vendus e o do AirMenu). */
  saftFiles: SaftFile[];
}

export interface GenerateSalesDeclarationPort {
  /**
   * Soma, por dia, o líquido (sem IVA) de todos os SAF-T e devolve o Excel.
   * Lança `InvalidSaftFileError` / `InvalidSalesDeclarationRequestError` se os ficheiros não servirem.
   */
  execute(input: GenerateSalesDeclarationInput): Promise<SalesDeclarationFile>;
}

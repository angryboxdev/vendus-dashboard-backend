/** Dia civil no formato YYYY-MM-DD. */
export type IsoDate = string;

/** Valor líquido (sem IVA, já líquido de notas de crédito) de um dia. */
export interface DailySales {
  date: IsoDate;
  netCents: number;
}

/** Documento de venda lido de um SAF-T. `netCents` já vem com sinal: negativo nas notas de crédito. */
export interface SaftSalesDocument {
  /** Número do documento (ex.: "FS 01P2026/5201") — usado para não contar duas vezes o mesmo documento. */
  number: string;
  date: IsoDate;
  netCents: number;
}

export interface SaftSalesData {
  /** Período declarado no cabeçalho do SAF-T (se existir). */
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  documents: SaftSalesDocument[];
}

/** Conteúdo (texto) de um SAF-T enviado. */
export interface SaftFile {
  name: string;
  content: string;
}

/** Linha da declaração: um dia e o total das fontes. */
export interface SalesDeclarationRow {
  date: IsoDate;
  normalCents: number;
}

/** Identificação da loja que consta nas colunas fixas do ficheiro do centro comercial. */
export interface SalesDeclarationStore {
  businessUnitCode: string;
  businessUnit: string;
  companyName: string;
  storeNumber: string;
  contract: string;
}

export interface SalesDeclarationFile {
  fileName: string;
  content: Buffer;
}

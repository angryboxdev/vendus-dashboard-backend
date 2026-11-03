import type { SeriesMode } from "../entities/series-mode.js";

/**
 * Verificações antes de emitir (DL 28/2019, art. 4.º; Despacho 8632/2014,
 * pontos 1.6, 3.2.1, 3.4.2 e 3.4.3). `blocked` impede a emissão; `warnings`
 * exigem confirmação expressa do utilizador.
 */
export type IssueBlock = "uncertified-program" | "date-before-last-in-series";
export type IssueWarning = "future-document-date" | "system-clock-behind";

export interface IssueCheckInput {
  seriesMode: SeriesMode;
  /** N.º de certificado da AT; null enquanto o programa não está certificado. */
  certificateNumber: string | null;
  /** SystemEntryDate atual (hora legal do estabelecimento). */
  now: string;
  documentDate: string;
  lastDocumentDateInSeries: string | null;
  lastSystemEntryDateAnySeries: string | null;
}

export interface IssueCheck {
  blocked: IssueBlock[];
  warnings: IssueWarning[];
}

/** Datas no formato da AT comparam-se como texto (AAAA-MM-DD[THH:MM:SS]). */
export function checkIssue(input: IssueCheckInput): IssueCheck {
  const blocked: IssueBlock[] = [];
  const warnings: IssueWarning[] = [];

  if (input.certificateNumber === null && input.seriesMode !== "training") blocked.push("uncertified-program");
  if (input.lastDocumentDateInSeries !== null && input.documentDate < input.lastDocumentDateInSeries) {
    blocked.push("date-before-last-in-series");
  }

  if (input.documentDate > input.now.slice(0, 10)) warnings.push("future-document-date");
  if (input.lastSystemEntryDateAnySeries !== null && input.now < input.lastSystemEntryDateAnySeries) {
    warnings.push("system-clock-behind");
  }
  return { blocked, warnings };
}

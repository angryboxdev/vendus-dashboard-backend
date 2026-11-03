import type { SeriesMode } from "../entities/series-mode.js";
import type { FiscalNow } from "../ports/out/clock.port.js";

/**
 * Verificações antes de emitir (DL 28/2019, art. 4.º; Despacho 8632/2014,
 * pontos 3.4.2 e 3.4.3). `blocked` impede a emissão; `warnings` exigem
 * confirmação expressa do utilizador. A cronologia dentro da série é conferida
 * por `planNextDocument` (e outra vez pela BD).
 */
export type IssueBlock = "uncertified-program";
export type IssueWarning = "future-document-date" | "system-clock-behind";

export interface IssueCheckInput {
  seriesMode: SeriesMode;
  /** N.º de certificado da AT; null enquanto o programa não está certificado. */
  certificateNumber: string | null;
  now: FiscalNow;
  documentDate: string;
  /** Instante UTC da última emissão do emitente, em qualquer série. */
  lastSystemEntryAtAnySeries: string | null;
}

export interface IssueCheck {
  blocked: IssueBlock[];
  warnings: IssueWarning[];
}

export function checkIssue(input: IssueCheckInput): IssueCheck {
  const blocked: IssueBlock[] = [];
  const warnings: IssueWarning[] = [];

  if (input.certificateNumber === null && input.seriesMode !== "training") blocked.push("uncertified-program");

  // Datas da AT (AAAA-MM-DD) comparam-se como texto; instantes pela linha do tempo (a hora local repete-se em outubro).
  if (input.documentDate > input.now.date) warnings.push("future-document-date");
  if (input.lastSystemEntryAtAnySeries !== null && Date.parse(input.now.instant) < Date.parse(input.lastSystemEntryAtAnySeries)) {
    warnings.push("system-clock-behind");
  }
  return { blocked, warnings };
}

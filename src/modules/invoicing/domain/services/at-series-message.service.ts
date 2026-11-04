import type { SeriesState } from "../entities/series.js";
import { soapFault } from "./at-soap.service.js";
import { el, fit, tagBlocks, tagText } from "./xml-text.js";

/**
 * Corpo SOAP do serviço de séries (`Comunicacao_Series.wsdl`, namespace
 * `http://at.gov.pt/`). O esquema não qualifica os elementos locais: só o
 * elemento da operação leva o namespace. Puro.
 */
export const SERIES_NS = "http://at.gov.pt/";

/** classeDoc: SI faturas e retificativos, WD documentos de conferência. */
const docClass = (s: SeriesState) => (s.documentType === "CM" ? "WD" : "SI");
const op = (name: string, inner: string) => `<at:${name} xmlns:at="${SERIES_NS}">${inner}</at:${name}>`;
const ids = (s: SeriesState) => el("serie", s.seriesId) + el("classeDoc", docClass(s)) + el("tipoDoc", s.documentType);

/**
 * `registarSerie`: tipoSerie F nas séries de formação, N nas normais;
 * numCertSWFatur «0» enquanto o programa não tem certificado; meio PI (programa informático).
 */
export function registerSeriesBody(s: SeriesState, q: { startDate: string; certificateNumber: string }): string {
  return op(
    "registarSerie",
    el("serie", s.seriesId) +
      el("tipoSerie", s.mode === "training" ? "F" : "N") +
      el("classeDoc", docClass(s)) +
      el("tipoDoc", s.documentType) +
      el("numInicialSeq", String(s.lastSequence + 1)) +
      el("dataInicioPrevUtiliz", q.startDate) +
      el("numCertSWFatur", q.certificateNumber) +
      el("meioProcessamento", "PI"),
  );
}

/** `finalizarSerie`: a série deixa de ser usada depois do último documento emitido. */
export function finalizeSeriesBody(s: SeriesState, justification?: string): string {
  return op(
    "finalizarSerie",
    ids(s) + el("codValidacaoSerie", s.validationCode ?? "") + el("seqUltimoDocEmitido", String(s.lastSequence)) + (justification ? el("justificacao", fit(justification, 4000)) : ""),
  );
}

/** `anularSerie`: comunicada por erro e nunca usada — motivo «ER» e declaração de não emissão. */
export function cancelSeriesBody(s: SeriesState): string {
  return op("anularSerie", ids(s) + el("codValidacaoSerie", s.validationCode ?? "") + el("motivo", "ER") + el("declaracaoNaoEmissao", "true"));
}

/** `consultarSeries` da série (para confirmar o estado na AT). */
export function consultSeriesBody(s: SeriesState): string {
  return op("consultarSeries", ids(s));
}

export interface AtSeriesInfo {
  seriesId: string;
  documentType: string;
  validationCode: string | null;
  /** A ativa, N anulada, F finalizada. */
  status: string | null;
}

export interface AtSeriesResponse {
  code: number | null;
  message: string;
  series: AtSeriesInfo[];
}

/** Resposta de qualquer operação de séries: resultado (`infoResultOper`) e séries devolvidas (`infoSerie`). */
export function parseSeriesResponse(xml: string): AtSeriesResponse {
  const fault = soapFault(xml);
  if (fault !== null) return { code: null, message: fault, series: [] };
  const raw = tagText(xml, "codResultOper");
  return {
    code: raw !== null && /^-?\d+$/.test(raw) ? Number(raw) : null,
    message: tagText(xml, "msgResultOper") ?? "Resposta da AT sem mensagem",
    series: tagBlocks(xml, "infoSerie").map((b) => ({
      seriesId: tagText(b, "serie") ?? "",
      documentType: tagText(b, "tipoDoc") ?? "",
      validationCode: tagText(b, "codValidacaoSerie"),
      status: tagText(b, "estado"),
    })),
  };
}

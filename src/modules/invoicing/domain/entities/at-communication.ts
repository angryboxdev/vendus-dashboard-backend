/**
 * Comunicação à AT por webservice (e-Fatura e Séries). Manuais «e-Fatura —
 * Comunicação por webservice» (Aspetos genéricos v1.0 e Aspetos específicos
 * v3.0, out. 2025) e WSDL `Comunicacao_Series.wsdl` / `Fatcorews.wsdl`.
 */

/** Ambiente da AT. Nesta fase só «test» (portas de testes); produção exige o certificado. */
export type AtEnvironment = "test" | "production";

/** Subutilizador do Portal das Finanças: `<NIF do emitente>/<n.º>` (WFA faturas, WSE séries). */
export interface AtCredentials {
  username: string;
  password: string;
}

export const AT_USERNAME = /^(\d{9})\/(\d{1,4})$/;

/** Resultado de um envio ao e-Fatura. */
export type AtOutcome =
  /** Registado / estado alterado (ou já registado com os mesmos dados, −10). */
  | "accepted"
  /** Dados recusados (códigos negativos): precisa de intervenção, não se repete sozinho. */
  | "rejected"
  /** Credenciais recusadas (códigos 1–99): pára os envios desse emitente. */
  | "auth"
  /** AT ou rede indisponível (−97, −99, falha de ligação): volta a tentar mais tarde. */
  | "failed";

export type AtOperation = "register" | "change-status";

/** Um documento cujo estado atual ainda não foi aceite pela AT. */
export interface AtQueueItem {
  documentId: string;
  legalEntityId: string;
  documentNumber: string;
  documentType: string;
  documentDate: string;
  status: "N" | "A" | "F";
  /** Último estado aceite pela AT; null se o documento nunca foi registado. */
  acceptedStatus: "N" | "A" | "F" | null;
  /** Tentativas falhadas desde o último aceite. */
  failures: number;
  lastAttemptAt: string | null;
  lastOutcome: AtOutcome | null;
  lastCode: number | null;
  lastMessage: string | null;
}

/** Um envio ao e-Fatura tal como fica registado (append-only). */
export interface AtCommunicationRecord {
  documentId: string;
  environment: AtEnvironment;
  operation: AtOperation;
  documentStatus: "N" | "A" | "F";
  outcome: AtOutcome;
  code: number | null;
  message: string | null;
  actor: string;
}

export interface AtCommunicationView extends AtCommunicationRecord {
  createdAt: string;
}

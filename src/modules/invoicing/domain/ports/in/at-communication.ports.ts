import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { AtCommunicationView, AtCredentials, AtEnvironment } from "../../entities/at-communication.js";
import type { SeriesState } from "../../entities/series.js";
import type { AtQueueSummary } from "../../services/at-queue.service.js";
import type { AtCredentialsSummary } from "../out/at-credentials.port.js";

export interface AtProblem {
  documentId: string;
  documentNumber: string;
  code: number | null;
  message: string | null;
  outcome: "rejected" | "auth";
}

export interface AtStatus {
  /** Certificado mTLS e chave pública da AT configurados no servidor. */
  configured: boolean;
  environment: AtEnvironment;
  credentials: AtCredentialsSummary[];
  queue: AtQueueSummary;
  /** Documentos recusados pela AT (os mais antigos primeiro). */
  problems: AtProblem[];
}

export interface CommunicateResult {
  attempted: number;
  accepted: number;
  rejected: number;
  failed: number;
  /** Sem credenciais WFA do emitente (ficam na fila). */
  withoutCredentials: number;
}

/** Comunicação à AT: e-Fatura (documentos) e séries. */
export interface AtCommunicationPort {
  status(org: OrganizationId): Promise<AtStatus>;
  saveCredentials(org: OrganizationId, actor: string, legalEntityId: string, credentials: AtCredentials): Promise<void>;
  removeCredentials(org: OrganizationId, actor: string, legalEntityId: string): Promise<void>;
  /** Envia o que falta (registos e mudanças de estado). `force` repete também os recusados. */
  communicatePending(org: OrganizationId, actor: string, opts?: { force?: boolean }): Promise<CommunicateResult>;
  documentCommunications(org: OrganizationId, documentId: string): Promise<AtCommunicationView[]>;
  /** Séries: credenciais WSE pedidas no momento, nunca guardadas. */
  registerSeries(org: OrganizationId, actor: string, seriesRef: string, credentials: AtCredentials): Promise<SeriesState>;
  finalizeSeries(org: OrganizationId, actor: string, seriesRef: string, credentials: AtCredentials, justification?: string): Promise<void>;
  cancelSeries(org: OrganizationId, actor: string, seriesRef: string, credentials: AtCredentials): Promise<void>;
}

import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { AtCommunicationRecord, AtCommunicationView, AtEnvironment, AtQueueItem } from "../../entities/at-communication.js";

/** Registo append-only das comunicações ao e-Fatura (também é a fila) e estado das séries na AT. */
export interface AtCommunicationStorePort {
  /** Documentos cujo estado atual ainda não foi aceite no ambiente, por ordem de emissão. */
  queue(org: OrganizationId, environment: AtEnvironment, limit: number): Promise<AtQueueItem[]>;
  record(org: OrganizationId, r: AtCommunicationRecord): Promise<void>;
  forDocument(org: OrganizationId, documentId: string): Promise<AtCommunicationView[]>;
  /** Série finalizada ou anulada na AT: deixa de emitir (a BD só deixa sair de «active»). */
  setSeriesStatus(org: OrganizationId, seriesRef: string, status: "finalized" | "cancelled"): Promise<void>;
}

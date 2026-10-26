import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { OccurrenceDTO } from "./occurrence.ports.js";

/** Ocorrência (existente ou a gerar) a que uma fatura pode ser associada. */
export interface InvoiceRecurrenceCandidateDTO {
  recurrenceId: string;
  recurrenceName: string;
  supplierName: string;
  period: string; // YYYY-MM
  /** null = a ocorrência desse mês ainda não existe (é gerada ao associar). */
  occurrenceId: string | null;
  estimatedAmountCents: number;
  /** Desvio do total da fatura face ao previsto (%). */
  deviationPercent: number | null;
}

export interface InvoiceRecurrenceLinkDTO {
  occurrence: OccurrenceDTO;
  recurrenceName: string;
}

export interface InvoiceRecurrenceStatusDTO {
  /** Ocorrência a que a fatura já está associada, se estiver. */
  linked: InvoiceRecurrenceLinkDTO | null;
  /** Só quando ainda não está associada. */
  candidates: InvoiceRecurrenceCandidateDTO[];
}

export type AutoLinkOutcome = "linked" | "suggested" | "already_linked" | "none";

export interface AutoLinkInvoiceResult {
  outcome: AutoLinkOutcome;
  occurrenceId: string | null;
  candidateCount: number;
}

export interface InvoiceQuery {
  organizationId: OrganizationId;
  invoiceId: string;
}

export interface LinkInvoiceToRecurrenceCommand {
  organizationId: OrganizationId;
  invoiceId: string;
  recurrenceId: string;
  period: string; // YYYY-MM
}

export interface UnlinkInvoiceCommand {
  organizationId: OrganizationId;
  occurrenceId: string;
}

/** Chamado pelas faturas depois de lançadas: associa sozinho só com um único candidato. */
export interface AutoLinkInvoicePort {
  execute(query: InvoiceQuery): Promise<AutoLinkInvoiceResult>;
}

export interface ReleaseInvoiceLinksCommand {
  organizationId: OrganizationId;
  invoiceId: string;
  /** Documento de pagamento da fatura apagada (lido antes de apagar), ou null. */
  paymentGroupId: string | null;
}

/**
 * Fatura apagada: desfaz as associações ainda não pagas — ou, num documento de pagamento com
 * mais faturas, mantém a ocorrência ligada às que restam (real = soma delas).
 */
export interface ReleaseInvoiceLinksPort {
  execute(command: ReleaseInvoiceLinksCommand): Promise<void>;
}

export interface GetInvoiceRecurrenceStatusPort {
  execute(query: InvoiceQuery): Promise<InvoiceRecurrenceStatusDTO>;
}

export interface LinkInvoiceToRecurrencePort {
  execute(command: LinkInvoiceToRecurrenceCommand): Promise<OccurrenceDTO>;
}

export interface UnlinkInvoiceFromOccurrencePort {
  execute(command: UnlinkInvoiceCommand): Promise<OccurrenceDTO>;
}

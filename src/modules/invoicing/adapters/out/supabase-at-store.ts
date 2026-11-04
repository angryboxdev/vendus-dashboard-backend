import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { AtCommunicationRecord, AtCommunicationView, AtEnvironment, AtOutcome, AtQueueItem } from "../../domain/entities/at-communication.js";
import { InvoicingNotFoundError, InvoicingRuleError } from "../../domain/errors.js";
import type { AtCommunicationStorePort } from "../../domain/ports/out/at-communication-store.port.js";

interface QueueRow {
  document_id: string;
  legal_entity_id: string;
  document_number: string;
  document_type: string;
  document_date: string;
  status: "N" | "A" | "F";
  accepted_status: "N" | "A" | "F" | null;
  failures: number;
  last_attempt_at: string | null;
  last_outcome: AtOutcome | null;
  last_code: number | null;
  last_message: string | null;
}

interface CommunicationRow {
  document_id: string;
  environment: AtEnvironment;
  operation: AtCommunicationRecord["operation"];
  document_status: "N" | "A" | "F";
  outcome: AtOutcome;
  response_code: number | null;
  response_message: string | null;
  actor: string;
  created_at: string;
}

/** Fila e registo das comunicações à AT (`20261220120000_invoicing_at_communication.sql`). */
export class SupabaseAtStore implements AtCommunicationStorePort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async queue(org: OrganizationId, environment: AtEnvironment, limit: number): Promise<AtQueueItem[]> {
    const { data, error } = await this.scoped(org).invoicingAtQueue(environment, limit);
    if (error) throw new Error(`Faturação: erro a ler a fila da AT: ${error.message}`);
    return ((data ?? []) as QueueRow[]).map((r) => ({
      documentId: r.document_id,
      legalEntityId: r.legal_entity_id,
      documentNumber: r.document_number,
      documentType: r.document_type,
      documentDate: r.document_date,
      status: r.status,
      acceptedStatus: r.accepted_status,
      failures: r.failures,
      lastAttemptAt: r.last_attempt_at,
      lastOutcome: r.last_outcome,
      lastCode: r.last_code,
      lastMessage: r.last_message,
    }));
  }

  async record(org: OrganizationId, r: AtCommunicationRecord): Promise<void> {
    const { error } = await this.scoped(org)
      .table("invoicing_at_communications")
      .insert({
        document_id: r.documentId,
        environment: r.environment,
        operation: r.operation,
        document_status: r.documentStatus,
        outcome: r.outcome,
        response_code: r.code,
        response_message: r.message === null ? null : r.message.slice(0, 1000),
        actor: r.actor,
      });
    if (error) throw new Error(`Faturação: erro a registar a comunicação à AT: ${error.message}`);
  }

  async forDocument(org: OrganizationId, documentId: string): Promise<AtCommunicationView[]> {
    const { data, error } = await this.scoped(org)
      .table("invoicing_at_communications")
      .select("document_id, environment, operation, document_status, outcome, response_code, response_message, actor, created_at")
      .eq("document_id", documentId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`Faturação: erro a ler as comunicações à AT: ${error.message}`);
    return ((data ?? []) as unknown as CommunicationRow[]).map((r) => ({
      documentId: r.document_id,
      environment: r.environment,
      operation: r.operation,
      documentStatus: r.document_status,
      outcome: r.outcome,
      code: r.response_code,
      message: r.response_message,
      actor: r.actor,
      createdAt: r.created_at,
    }));
  }

  async setSeriesStatus(org: OrganizationId, seriesRef: string, status: "finalized" | "cancelled"): Promise<void> {
    const { data, error } = await this.scoped(org).table("invoicing_series").update({ status }).eq("id", seriesRef).select("id").maybeSingle();
    // O trigger só deixa sair de «active» e só anula séries sem documentos.
    if (error) throw new InvoicingRuleError("A série já não está ativa ou tem documentos");
    if (!data) throw new InvoicingNotFoundError("Série");
  }
}

import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { InvoiceAuditEntry, InvoiceAuditPort } from "../../domain/ports/out/invoice-audit.port.js";

/** Tabela `invoice_audit_logs` (migração 20261030160000) — só insert. */
export class SupabaseInvoiceAuditAdapter implements InvoiceAuditPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async record(organizationId: OrganizationId, e: InvoiceAuditEntry): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("invoice_audit_logs").insert({
      invoice_id: e.invoiceId,
      action: e.action,
      actor: e.actor,
      origin: e.origin,
      reason: e.reason,
      before: e.before,
      after: e.after,
    });
    if (error) throw new Error(error.message);
  }
}

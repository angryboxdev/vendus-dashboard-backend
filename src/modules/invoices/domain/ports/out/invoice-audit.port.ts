import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Registo de auditoria de uma fatura (F1 §1.4): quem, de onde, antes/depois e motivo. Só se acrescenta. */
export interface InvoiceAuditEntry {
  invoiceId: string;
  action: "create" | "confirm" | "update" | "delete";
  actor: string;
  origin: "manual" | "import" | "system";
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface InvoiceAuditPort {
  record(organizationId: OrganizationId, entry: InvoiceAuditEntry): Promise<void>;
}

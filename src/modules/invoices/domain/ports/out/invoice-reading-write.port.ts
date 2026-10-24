import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Grava na fatura os campos do QR fiscal e a origem dos dados (migração 20261106100000). */
export interface InvoiceReadingWritePort {
  save(organizationId: OrganizationId, invoiceId: string, data: { fiscalQr: Record<string, string> | null; source: "deterministic" | "ai" }): Promise<void>;
}

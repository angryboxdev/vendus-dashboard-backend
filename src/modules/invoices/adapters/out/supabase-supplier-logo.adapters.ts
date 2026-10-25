import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { objectStorage } from "../../../../infra/scoped-db/object-storage.js";
import type { InvoiceAttachmentReadPort, SupplierInvoiceAttachmentsPort } from "../../domain/ports/out/supplier-logo.ports.js";

const BUCKET = "invoice-documents";

/** Lê um anexo do bucket das faturas a partir do URL público gravado na fatura (outro URL → `null`). */
export class SupabaseInvoiceAttachmentReadAdapter implements InvoiceAttachmentReadPort {
  async read(organizationId: OrganizationId, url: string): Promise<Buffer | null> {
    const marker = `/object/public/${BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    const path = decodeURIComponent(url.slice(idx + marker.length));
    return objectStorage.download(BUCKET, path, organizationId);
  }
}

export class SupabaseSupplierInvoiceAttachmentsAdapter implements SupplierInvoiceAttachmentsPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async recentPdfAttachments(organizationId: OrganizationId, supplierId: string, limit: number): Promise<{ invoiceId: string; url: string }[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("invoices")
      .select("id, attachment_url")
      .eq("supplier_id", supplierId)
      .neq("status", "cancelled")
      .ilike("attachment_url", "%.pdf")
      .order("invoice_date", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as { id: string; attachment_url: string }[]).map((r) => ({ invoiceId: r.id, url: r.attachment_url }));
  }
}

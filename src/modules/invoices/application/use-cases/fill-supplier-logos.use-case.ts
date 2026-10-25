import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { FillMissingSupplierLogosResult, FillSupplierLogoResult, FillSupplierLogosPort } from "../../domain/ports/in/supplier-logo.ports.js";
import type { SupplierLookupPort } from "../../domain/ports/out/supplier-lookup.port.js";
import type { PdfContentReaderPort } from "../../domain/ports/out/pdf-content-reader.port.js";
import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";
import type { InvoiceAttachmentReadPort, SupplierInvoiceAttachmentsPort, SupplierLogoWritePort } from "../../domain/ports/out/supplier-logo.ports.js";

/** Faturas a experimentar por fornecedor: digitalizadas (logótipo dentro da imagem da página) não dão. */
const INVOICES_PER_SUPPLIER = 3;
const DEFAULT_BATCH = 10;

/**
 * Logótipo do fornecedor a partir das faturas (2026-10-25): a mesma deteção da E3b-1
 * (`extractLogo`, imagem no topo da 1.ª página), mas gravada logo no fornecedor — só quando ainda
 * não tem logótipo, nunca por cima de um existente. Nunca lança por causa de um PDF ilegível.
 */
export class FillSupplierLogosUseCase implements FillSupplierLogosPort {
  constructor(
    private readonly suppliers: Pick<SupplierLookupPort, "findById" | "findAll">,
    private readonly attachments: SupplierInvoiceAttachmentsPort,
    private readonly attachmentRead: InvoiceAttachmentReadPort,
    private readonly pdf: Pick<PdfContentReaderPort, "extractLogo">,
    private readonly storage: Pick<DocumentStoragePort, "store">,
    private readonly logoWrite: SupplierLogoWritePort,
  ) {}

  async fillForSupplier(organizationId: OrganizationId, supplierId: string, preferredInvoiceId?: string): Promise<FillSupplierLogoResult> {
    const supplier = await this.suppliers.findById(organizationId, supplierId);
    if (!supplier || supplier.logoUrl) return { filled: false };

    const recent = await this.attachments.recentPdfAttachments(organizationId, supplierId, INVOICES_PER_SUPPLIER + 1);
    const ordered = [...recent.filter((a) => a.invoiceId === preferredInvoiceId), ...recent.filter((a) => a.invoiceId !== preferredInvoiceId)].slice(0, INVOICES_PER_SUPPLIER);

    for (const { url } of ordered) {
      const logo = await this.logoFrom(organizationId, url);
      if (!logo) continue;
      const logoUrl = await this.storage.store(logo, "logo-fornecedor.png", "image/png", organizationId);
      await this.logoWrite.setLogo(organizationId, supplierId, logoUrl);
      return { filled: true, logoUrl };
    }
    return { filled: false };
  }

  async fillMissing(organizationId: OrganizationId, options: { after?: string; batchSize?: number } = {}): Promise<FillMissingSupplierLogosResult> {
    const batchSize = Math.max(1, Math.min(options.batchSize ?? DEFAULT_BATCH, 25));
    const missing = (await this.suppliers.findAll(organizationId))
      .filter((s) => !s.logoUrl)
      .map((s) => s.id)
      .sort()
      .filter((id) => options.after === undefined || id > options.after);
    const batch = missing.slice(0, batchSize);

    let filled = 0;
    for (const id of batch) {
      const r = await this.fillForSupplier(organizationId, id).catch(() => ({ filled: false }));
      if (r.filled) filled++;
    }
    return { processed: batch.length, filled, next: missing.length > batch.length ? batch[batch.length - 1]! : null };
  }

  private async logoFrom(organizationId: OrganizationId, url: string): Promise<Buffer | null> {
    try {
      const pdf = await this.attachmentRead.read(organizationId, url);
      if (!pdf) return null;
      return (await this.pdf.extractLogo(pdf))?.png ?? null;
    } catch {
      return null;
    }
  }
}

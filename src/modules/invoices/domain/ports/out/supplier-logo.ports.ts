import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Conteúdo de um anexo de fatura guardado no armazenamento da organização (`null` se não for nosso). */
export interface InvoiceAttachmentReadPort {
  read(organizationId: OrganizationId, url: string): Promise<Buffer | null>;
}

/** PDFs anexados às faturas mais recentes do fornecedor (não canceladas), da mais recente para a mais antiga. */
export interface SupplierInvoiceAttachmentsPort {
  recentPdfAttachments(organizationId: OrganizationId, supplierId: string, limit: number): Promise<{ invoiceId: string; url: string }[]>;
}

/** Grava o logótipo no fornecedor (módulo financial-base, D10). */
export interface SupplierLogoWritePort {
  setLogo(organizationId: OrganizationId, supplierId: string, logoUrl: string): Promise<void>;
}

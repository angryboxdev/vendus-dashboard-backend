import type { DeleteInvoicePort } from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";
import type { PayableEntryWritePort } from "../../domain/ports/out/payable-entry-write.port.js";
import type { InvoiceReconciliationCleanupPort } from "../../domain/ports/out/invoice-reconciliation-cleanup.port.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";

export class DeleteInvoiceUseCase implements DeleteInvoicePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
    private readonly storage: DocumentStoragePort,
    private readonly payableWrite: PayableEntryWritePort,
    private readonly reconciliationCleanup: InvoiceReconciliationCleanupPort,
  ) {}

  async execute(organizationId: OrganizationId, id: string): Promise<void> {
    const existing = await this.invoiceRepo.findById(organizationId, id);
    if (!existing) throw new InvoiceNotFoundError(id);

    const attachmentUrl = existing.attachmentUrl;

    // Limpar dependências antes de apagar a fatura
    await this.lineRepo.deleteByInvoiceId(organizationId, id);
    await this.reconciliationCleanup.removeLinksForInvoice(organizationId, id);
    await this.payableWrite.cancelByInvoiceId(organizationId, id);

    await this.invoiceRepo.delete(organizationId, id);

    if (attachmentUrl) {
      await this.storage.delete(attachmentUrl);
    }
  }
}

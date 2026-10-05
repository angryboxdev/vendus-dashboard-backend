import type { DeleteInvoiceCommand, DeleteInvoicePort } from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";
import type { PayableEntryWritePort } from "../../domain/ports/out/payable-entry-write.port.js";
import type { InvoiceReconciliationCleanupPort } from "../../domain/ports/out/invoice-reconciliation-cleanup.port.js";
import type { InvoiceStockReviewStatusReadPort } from "../../domain/ports/out/invoice-stock-review-status-read.port.js";
import type { InvoiceStockReviewDraftDeletePort } from "../../domain/ports/out/invoice-stock-review-draft-delete.port.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";
import { guardAgainstBlockingStockReview } from "./shared-stock-review-guard.js";

export class DeleteInvoiceUseCase implements DeleteInvoicePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
    private readonly storage: DocumentStoragePort,
    private readonly payableWrite: PayableEntryWritePort,
    private readonly reconciliationCleanup: InvoiceReconciliationCleanupPort,
    private readonly stockReviewStatusRead: InvoiceStockReviewStatusReadPort,
    private readonly stockReviewDraftDelete: InvoiceStockReviewDraftDeletePort,
  ) {}

  async execute(command: DeleteInvoiceCommand): Promise<void> {
    const { organizationId, id } = command;
    const existing = await this.invoiceRepo.findById(organizationId, id);
    if (!existing) throw new InvoiceNotFoundError(id);

    const attachmentUrl = existing.attachmentUrl;

    // Módulo Stock (Compra por rever, D10) — apagar as linhas pode deixar
    // órfã uma revisão de stock já criada a partir delas (ver
    // `shared-stock-review-guard`), com o mesmo risco de violação da FK
    // `stock_review_lines_invoice_line_id_fkey` já corrigido em
    // `UpdateInvoiceUseCase`/`SetLineDetailModeUseCase`.
    await guardAgainstBlockingStockReview({
      organizationId,
      invoiceId: id,
      confirmRemoveStockReview: command.confirmRemoveStockReview,
      actor: command.actor ?? "system",
      statusRead: this.stockReviewStatusRead,
      draftDelete: this.stockReviewDraftDelete,
    });

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

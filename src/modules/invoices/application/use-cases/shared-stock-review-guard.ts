import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { InvoiceLinesLockedByAppliedStockReviewError, StockReviewRemovalConfirmationRequiredError } from "../../domain/errors.js";
import type { InvoiceStockReviewStatusReadPort } from "../../domain/ports/out/invoice-stock-review-status-read.port.js";
import type { InvoiceStockReviewDraftDeletePort } from "../../domain/ports/out/invoice-stock-review-draft-delete.port.js";

export interface GuardAgainstBlockingStockReviewOptions {
  organizationId: OrganizationId;
  invoiceId: string;
  confirmRemoveStockReview: boolean | undefined;
  actor: string;
  statusRead: InvoiceStockReviewStatusReadPort;
  draftDelete: InvoiceStockReviewDraftDeletePort;
}

/**
 * Guard partilhado por `UpdateInvoiceUseCase` (mudança de
 * `stockReviewOverride`) e `SetLineDetailModeUseCase` (descarte de linhas
 * detalhadas ao voltar para `simple`) — ambas as operações podem tornar
 * órfã uma revisão de stock já criada para esta fatura (módulo
 * `stock-purchase-review`, D10).
 *
 * - Sem revisão associada → nada a fazer, a operação prossegue normalmente.
 * - Revisão `applied` (já gerou movimentos reais) → bloqueia sempre,
 *   `InvoiceLinesLockedByAppliedStockReviewError` — nunca aceita
 *   confirmação, o utilizador tem de desfazer a entrada de stock primeiro.
 * - Revisão ainda não aplicada (`pending`/`in_review`/`partial`/`ready`/
 *   `cancelled`) → só prossegue com confirmação explícita
 *   (`confirmRemoveStockReview: true`), momento em que o rascunho é
 *   hard-deleted (única exceção à regra "nunca hard delete" de
 *   `stock-purchase-review`, ver o README desse módulo); sem confirmação
 *   lança `StockReviewRemovalConfirmationRequiredError` — nunca descarta
 *   silenciosamente.
 */
export async function guardAgainstBlockingStockReview(opts: GuardAgainstBlockingStockReviewOptions): Promise<void> {
  const snapshot = await opts.statusRead.findForInvoice(opts.organizationId, opts.invoiceId);
  if (!snapshot) return;

  if (snapshot.status === "applied") {
    throw new InvoiceLinesLockedByAppliedStockReviewError(opts.invoiceId);
  }

  if (!opts.confirmRemoveStockReview) {
    throw new StockReviewRemovalConfirmationRequiredError(opts.invoiceId);
  }

  await opts.draftDelete.deleteDraft(opts.organizationId, opts.invoiceId, opts.actor);
}

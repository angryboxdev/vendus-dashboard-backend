import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { InvoiceLine } from "../../domain/entities/invoice-line.js";
import type { CreateInvoiceLineCommand } from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceStockReviewStatusReadPort } from "../../domain/ports/out/invoice-stock-review-status-read.port.js";
import type { InvoiceStockReviewDraftDeletePort } from "../../domain/ports/out/invoice-stock-review-draft-delete.port.js";
import { guardAgainstBlockingStockReview } from "./shared-stock-review-guard.js";

export interface StockLockedLinesDeps {
  statusRead: InvoiceStockReviewStatusReadPort;
  draftDelete: InvoiceStockReviewDraftDeletePort;
}

// O que define a linha (o total é recalculado pelo motor de valores, por isso não serve de critério).
const sameLine = (stored: InvoiceLine, cmd: CreateInvoiceLineCommand) =>
  stored.description.trim() === cmd.description.trim() &&
  Math.abs(stored.quantity - cmd.quantity) < 0.000001 &&
  Math.round(stored.unitCostWithoutVat) === Math.round(cmd.unitCostWithoutVat);

/**
 * F3c: as linhas de uma fatura que já está em Compras por rever (importada no Stock, ou encaminhada)
 * não podem ser apagadas e recriadas — as linhas da revisão apontam para elas. Se o pedido traz as
 * mesmas linhas (pela ordem: descrição, quantidade e preço), mantêm-se as guardadas e só se aplica a
 * classificação financeira. Se as mudou: revisão já movimentada → bloqueia; senão só com confirmação
 * explícita (a revisão por aplicar é descartada) e segue o caminho normal (devolve null).
 */
export async function keepLinesUnderStockReview(
  deps: StockLockedLinesDeps | undefined,
  opts: {
    organizationId: OrganizationId;
    invoiceId: string;
    storedLines: InvoiceLine[];
    lineCommands: CreateInvoiceLineCommand[] | undefined;
    confirmRemoveStockReview: boolean | undefined;
    actor: string;
  },
): Promise<InvoiceLine[] | null> {
  if (!deps || opts.lineCommands === undefined || opts.storedLines.length === 0) return null;
  const snapshot = await deps.statusRead.findForInvoice(opts.organizationId, opts.invoiceId);
  if (!snapshot) return null;
  const cmds = opts.lineCommands;
  if (cmds.length === opts.storedLines.length && opts.storedLines.every((l, i) => sameLine(l, cmds[i]!))) {
    return opts.storedLines.map((l, i) => {
      const c = cmds[i]!;
      return l.classify({
        ...(c.type !== undefined && { type: c.type }),
        ...(c.costCenterCategoryId !== undefined && { costCenterCategoryId: c.costCenterCategoryId }),
      });
    });
  }
  await guardAgainstBlockingStockReview({
    organizationId: opts.organizationId,
    invoiceId: opts.invoiceId,
    confirmRemoveStockReview: opts.confirmRemoveStockReview,
    actor: opts.actor,
    statusRead: deps.statusRead,
    draftDelete: deps.draftDelete,
  });
  return null;
}

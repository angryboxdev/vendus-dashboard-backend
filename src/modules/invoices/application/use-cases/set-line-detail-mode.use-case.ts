import type {
  SetLineDetailModePort,
  SetLineDetailModeCommand,
  InvoiceDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import type { InvoiceStockReviewStatusReadPort } from "../../domain/ports/out/invoice-stock-review-status-read.port.js";
import type { InvoiceStockReviewDraftDeletePort } from "../../domain/ports/out/invoice-stock-review-draft-delete.port.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";
import { toInvoiceDTO } from "./shared.js";
import { guardAgainstBlockingStockReview } from "./shared-stock-review-guard.js";

export class SetLineDetailModeUseCase implements SetLineDetailModePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
    private readonly stockReviewStatusRead: InvoiceStockReviewStatusReadPort,
    private readonly stockReviewDraftDelete: InvoiceStockReviewDraftDeletePort,
  ) {}

  async execute(command: SetLineDetailModeCommand): Promise<InvoiceDTO> {
    const existing = await this.invoiceRepo.findById(command.organizationId, command.id);
    if (!existing) throw new InvoiceNotFoundError(command.id);

    // Ao voltar para simple, as linhas do modo detalhado são descartadas.
    // Em modo simples a linha automática é derivada dos totais do cabeçalho da fatura;
    // linhas armazenadas ficariam ambíguas para analytics (DRE, cashflow, etc.).
    // O utilizador pode voltar a detailed a qualquer momento e recomeçar o detalhamento.
    if (command.mode === "simple" && existing.lineDetailMode === "detailed") {
      // Módulo Stock (Compra por rever, D10) — descartar as linhas pode
      // deixar órfã uma revisão de stock já criada a partir delas (ver
      // `shared-stock-review-guard`); só é preciso verificar quando há
      // algo mesmo a apagar.
      await guardAgainstBlockingStockReview({
        organizationId: command.organizationId,
        invoiceId: command.id,
        confirmRemoveStockReview: command.confirmRemoveStockReview,
        actor: command.actor ?? "system",
        statusRead: this.stockReviewStatusRead,
        draftDelete: this.stockReviewDraftDelete,
      });
      await this.lineRepo.deleteByInvoiceId(command.organizationId, command.id);
    }

    const updated = existing.setLineDetailMode(command.mode);
    await this.invoiceRepo.update(command.organizationId, updated);

    return toInvoiceDTO(updated);
  }
}

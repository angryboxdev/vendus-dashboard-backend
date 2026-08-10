import type {
  MarkInvoiceReconciledPort,
  MarkInvoiceReconciledCommand,
  InvoiceDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import {
  InvoiceNotFoundError,
  InvoiceAlreadyReconciledError,
  InvoiceNotPaidError,
} from "../../domain/errors.js";
import { toInvoiceDTO } from "./shared.js";

export class MarkInvoiceReconciledUseCase implements MarkInvoiceReconciledPort {
  constructor(private readonly invoiceRepo: InvoiceRepositoryPort) {}

  async execute(command: MarkInvoiceReconciledCommand): Promise<InvoiceDTO> {
    const existing = await this.invoiceRepo.findById(command.id);
    if (!existing) throw new InvoiceNotFoundError(command.id);

    if (existing.status !== "paid") {
      throw new InvoiceNotPaidError(command.id);
    }

    if (existing.reconciliationStatus === "reconciled") {
      throw new InvoiceAlreadyReconciledError(command.id);
    }

    const updated = existing.markReconciled();
    await this.invoiceRepo.update(updated);

    return toInvoiceDTO(updated);
  }
}

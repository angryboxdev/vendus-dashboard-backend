import type {
  MarkInvoicePaidPort,
  MarkInvoicePaidCommand,
  InvoiceDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { PayableEntryWritePort } from "../../domain/ports/out/payable-entry-write.port.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";
import { toInvoiceDTO } from "./shared.js";

export class MarkInvoicePaidUseCase implements MarkInvoicePaidPort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly payableWrite: PayableEntryWritePort,
  ) {}

  async execute(command: MarkInvoicePaidCommand): Promise<InvoiceDTO> {
    const existing = await this.invoiceRepo.findById(command.id);
    if (!existing) throw new InvoiceNotFoundError(command.id);

    const paidAt = command.paidAt ? new Date(command.paidAt) : new Date();
    const updated = existing.markPaid(paidAt, command.bankAccountId, command.paymentMethod, command.paymentNotes);
    await this.invoiceRepo.update(updated);

    // Sincronizar conta a pagar ligada, se existir
    await this.payableWrite.markPaidByInvoiceId(updated.id, paidAt);

    return toInvoiceDTO(updated);
  }
}

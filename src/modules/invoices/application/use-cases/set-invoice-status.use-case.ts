import type {
  SetInvoiceStatusPort,
  SetInvoiceStatusCommand,
  InvoiceDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { PayableEntryWritePort } from "../../domain/ports/out/payable-entry-write.port.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";
import { toInvoiceDTO } from "./shared.js";

export class SetInvoiceStatusUseCase implements SetInvoiceStatusPort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly payableWrite: PayableEntryWritePort,
  ) {}

  async execute(command: SetInvoiceStatusCommand): Promise<InvoiceDTO> {
    const existing = await this.invoiceRepo.findById(command.id);
    if (!existing) throw new InvoiceNotFoundError(command.id);

    const updated = existing.setStatus(command.status);
    await this.invoiceRepo.update(updated);

    // Sincronizar conta a pagar ligada consoante o novo status
    if (command.status === "cancelled") {
      await this.payableWrite.cancelByInvoiceId(updated.id);
    } else if (command.status === "paid") {
      await this.payableWrite.markPaidByInvoiceId(updated.id, new Date());
    }

    return toInvoiceDTO(updated);
  }
}

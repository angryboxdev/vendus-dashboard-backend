import type {
  SetInvoiceStatusPort,
  SetInvoiceStatusCommand,
  InvoiceDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";
import { toInvoiceDTO } from "./shared.js";

export class SetInvoiceStatusUseCase implements SetInvoiceStatusPort {
  constructor(private readonly invoiceRepo: InvoiceRepositoryPort) {}

  async execute(command: SetInvoiceStatusCommand): Promise<InvoiceDTO> {
    const existing = await this.invoiceRepo.findById(command.id);
    if (!existing) throw new InvoiceNotFoundError(command.id);

    const updated = existing.setStatus(command.status);
    await this.invoiceRepo.update(updated);
    return toInvoiceDTO(updated);
  }
}

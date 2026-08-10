import type {
  SetLineDetailModePort,
  SetLineDetailModeCommand,
  InvoiceDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";
import { toInvoiceDTO } from "./shared.js";

export class SetLineDetailModeUseCase implements SetLineDetailModePort {
  constructor(private readonly invoiceRepo: InvoiceRepositoryPort) {}

  async execute(command: SetLineDetailModeCommand): Promise<InvoiceDTO> {
    const existing = await this.invoiceRepo.findById(command.id);
    if (!existing) throw new InvoiceNotFoundError(command.id);

    const updated = existing.setLineDetailMode(command.mode);
    await this.invoiceRepo.update(updated);

    return toInvoiceDTO(updated);
  }
}

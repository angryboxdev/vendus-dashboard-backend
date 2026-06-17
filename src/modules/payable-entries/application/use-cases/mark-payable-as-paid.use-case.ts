import type { PayableEntryRepositoryPort } from "../../domain/ports/out/payable-entry-repository.port.js";
import type { InvoiceReadPort } from "../../domain/ports/out/invoice-read.port.js";
import type {
  MarkPayableAsPaidPort,
  MarkPayableAsPaidCommand,
  PayableEntryDTO,
} from "../../domain/ports/in/payable-entry.ports.js";
import { PayableEntryNotFoundError } from "../../domain/errors.js";
import { toDTO } from "./shared.js";

export class MarkPayableAsPaidUseCase implements MarkPayableAsPaidPort {
  constructor(
    private readonly repo: PayableEntryRepositoryPort,
    private readonly invoiceGateway: InvoiceReadPort,
  ) {}

  async execute(command: MarkPayableAsPaidCommand): Promise<PayableEntryDTO> {
    const entry = await this.repo.findById(command.id);
    if (!entry) throw new PayableEntryNotFoundError(command.id);

    const paidAt = command.paidAt ? new Date(command.paidAt) : new Date();
    const paid = entry.markPaid(paidAt);

    await this.repo.update(paid);

    // Sincronizar fatura ligada, se existir
    if (paid.invoiceId) {
      await this.invoiceGateway.markPaid(paid.invoiceId, paidAt);
    }

    return toDTO(paid);
  }
}

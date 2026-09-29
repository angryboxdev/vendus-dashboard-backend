import type {
  SetInvoiceLineDeductibilityOverridePort,
  SetInvoiceLineDeductibilityOverrideCommand,
  InvoiceLineDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import { InvoiceLineNotFoundError } from "../../domain/errors.js";
import { toInvoiceLineDTO } from "./shared.js";

/** Módulo Contabilidade — override de dedutibilidade de IVA por linha de fatura (confirmado com o utilizador). */
export class SetInvoiceLineDeductibilityOverrideUseCase implements SetInvoiceLineDeductibilityOverridePort {
  constructor(private readonly lineRepo: InvoiceLineRepositoryPort) {}

  async execute(command: SetInvoiceLineDeductibilityOverrideCommand): Promise<InvoiceLineDTO> {
    const lines = await this.lineRepo.findByInvoiceId(command.organizationId, command.invoiceId);
    const line = lines.find((l) => l.id === command.lineId);
    if (!line) throw new InvoiceLineNotFoundError(command.lineId);

    const updated = line.applyDeductibilityOverride(command.deductiblePercentage, command.deductibilityOverrideReason);
    await this.lineRepo.updateLine(command.organizationId, updated);
    return toInvoiceLineDTO(updated);
  }
}

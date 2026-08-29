import type {
  SetLineDetailModePort,
  SetLineDetailModeCommand,
  InvoiceDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";
import { toInvoiceDTO } from "./shared.js";

export class SetLineDetailModeUseCase implements SetLineDetailModePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
  ) {}

  async execute(command: SetLineDetailModeCommand): Promise<InvoiceDTO> {
    const existing = await this.invoiceRepo.findById(command.organizationId, command.id);
    if (!existing) throw new InvoiceNotFoundError(command.id);

    // Ao voltar para simple, as linhas do modo detalhado são descartadas.
    // Em modo simples a linha automática é derivada dos totais do cabeçalho da fatura;
    // linhas armazenadas ficariam ambíguas para analytics (DRE, cashflow, etc.).
    // O utilizador pode voltar a detailed a qualquer momento e recomeçar o detalhamento.
    if (command.mode === "simple" && existing.lineDetailMode === "detailed") {
      await this.lineRepo.deleteByInvoiceId(command.organizationId, command.id);
    }

    const updated = existing.setLineDetailMode(command.mode);
    await this.invoiceRepo.update(command.organizationId, updated);

    return toInvoiceDTO(updated);
  }
}

import type {
  SetLineDetailModePort,
  SetLineDetailModeCommand,
  InvoiceDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import { LINE_DETAIL_MODES } from "../../domain/entities/invoice.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";
import { toInvoiceDTO } from "./shared.js";

/**
 * Trocar de modo financeiro (F2 v1.2 §2.2) preserva o documento original,
 * as linhas reais, os impostos e as repartições: nada é apagado. As linhas só
 * alimentam a análise por CC em «Por artigo» (ver ListInvoiceLinesUseCase);
 * em «Única» vale a classificação do cabeçalho; em «Por valores», as
 * repartições. Antes desta versão, voltar a «Única» apagava as linhas.
 */
export class SetLineDetailModeUseCase implements SetLineDetailModePort {
  constructor(private readonly invoiceRepo: InvoiceRepositoryPort) {}

  async execute(command: SetLineDetailModeCommand): Promise<InvoiceDTO> {
    const existing = await this.invoiceRepo.findById(command.organizationId, command.id);
    if (!existing) throw new InvoiceNotFoundError(command.id);
    if (!LINE_DETAIL_MODES.includes(command.mode)) throw new Error(`Modo inválido: ${String(command.mode)}`);

    const updated = existing.setLineDetailMode(command.mode);
    await this.invoiceRepo.update(command.organizationId, updated);
    return toInvoiceDTO(updated);
  }
}

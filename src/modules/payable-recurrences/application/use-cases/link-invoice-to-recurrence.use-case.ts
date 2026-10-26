import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { LinkInvoiceToOccurrencePort, OccurrenceDTO } from "../../domain/ports/in/occurrence.ports.js";
import type { LinkInvoiceToRecurrenceCommand, LinkInvoiceToRecurrencePort } from "../../domain/ports/in/invoice-link.ports.js";
import { RecurrenceNotFoundError } from "../../domain/errors.js";
import { ensureOccurrence } from "./invoice-candidates.js";

/**
 * Associa a fatura à ocorrência (recorrência + mês), gerando a ocorrência desse mês
 * se ainda não existir; o resto (1:1, valor real, paga se a fatura já estiver paga)
 * é o caso de uso de sempre, `LinkInvoiceToOccurrence`.
 */
export class LinkInvoiceToRecurrenceUseCase implements LinkInvoiceToRecurrencePort {
  constructor(
    private readonly recurrenceRepo: RecurrenceRepositoryPort,
    private readonly occurrenceRepo: OccurrenceRepositoryPort,
    private readonly linkInvoice: LinkInvoiceToOccurrencePort,
  ) {}

  async execute(command: LinkInvoiceToRecurrenceCommand): Promise<OccurrenceDTO> {
    const match = /^(\d{4})-(\d{2})$/.exec(command.period);
    if (!match) throw new Error("period (YYYY-MM) inválido");
    const year = parseInt(match[1]!, 10);
    const month = parseInt(match[2]!, 10);

    const recurrence = await this.recurrenceRepo.findById(command.organizationId, command.recurrenceId);
    if (!recurrence) throw new RecurrenceNotFoundError(command.recurrenceId);

    const occurrence = await ensureOccurrence(command.organizationId, recurrence, year, month, this.occurrenceRepo);
    if (!occurrence) throw new Error(`A recorrência não tem ocorrência em ${command.period}`);

    return this.linkInvoice.execute({
      organizationId: command.organizationId,
      occurrenceId: occurrence.id,
      invoiceId: command.invoiceId,
    });
  }
}

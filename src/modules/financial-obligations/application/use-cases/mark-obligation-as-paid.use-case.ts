import type { FinancialObligationRepositoryPort } from "../../domain/ports/out/obligation-repository.port.js";
import type { OccurrenceSyncPort } from "../../domain/ports/out/occurrence-sync.port.js";
import type { InvoiceMarkPaidPort } from "../../domain/ports/out/invoice-mark-paid.port.js";
import type {
  MarkObligationAsPaidPort,
  MarkObligationAsPaidCommand,
  FinancialObligationDTO,
} from "../../domain/ports/in/obligation.ports.js";
import { ObligationNotFoundError } from "../../domain/errors.js";
import { toDTO } from "./shared.js";

export class MarkObligationAsPaidUseCase implements MarkObligationAsPaidPort {
  constructor(
    private readonly repo: FinancialObligationRepositoryPort,
    private readonly occurrenceSync: OccurrenceSyncPort,
    private readonly invoiceMarkPaid: InvoiceMarkPaidPort,
  ) {}

  async execute(command: MarkObligationAsPaidCommand): Promise<FinancialObligationDTO> {
    const obligation = await this.repo.findById(command.id);
    if (!obligation) throw new ObligationNotFoundError(command.id);

    const paidAt = command.paidAt ? new Date(command.paidAt) : new Date();
    const paid = obligation.markPaid(paidAt, command.paymentMethod ?? null);

    await this.repo.update(paid);

    // Sincronizar ocorrência recorrente vinculada, se existir
    if (paid.source === "recurrence") {
      await this.occurrenceSync.syncPayableMarkedPaid(paid.id);
    }

    // Sincronizar fatura vinculada, se existir
    if (paid.invoiceId) {
      await this.invoiceMarkPaid.markPaid(paid.invoiceId, paidAt);
    }

    return toDTO(paid);
  }
}

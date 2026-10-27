import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type {
  ReopenOccurrenceFromBankCommand,
  ReopenOccurrenceFromBankPort,
  SettleOccurrenceFromBankCommand,
  SettleOccurrenceFromBankPort,
} from "../../domain/ports/in/bank-payment.ports.js";

/** Marca no pagamento qual foi o movimento — é por ela que se sabe se o pode desfazer. */
export const bankPaymentNote = (movementId: string) => `Pago pela conciliação bancária [movimento ${movementId}]`;

export class SettleOccurrenceFromBankUseCase implements SettleOccurrenceFromBankPort {
  constructor(private readonly occurrenceRepo: OccurrenceRepositoryPort) {}

  async execute(command: SettleOccurrenceFromBankCommand): Promise<boolean> {
    const occurrence = await this.occurrenceRepo.findById(command.organizationId, command.occurrenceId);
    if (!occurrence) return false;
    if (occurrence.status === "paid" || occurrence.status === "cancelled") return false;
    // Fatura obrigatória e ainda sem fatura: fica ligada ao movimento mas só passa a paga com a fatura.
    if (occurrence.requireInvoice && occurrence.status !== "invoice_linked") return false;
    const paid = occurrence.markPaid(new Date(`${command.paidAt}T00:00:00.000Z`), "transfer", command.bankAccountId, bankPaymentNote(command.movementId));
    await this.occurrenceRepo.update(command.organizationId, paid);
    return true;
  }
}

export class ReopenOccurrenceFromBankUseCase implements ReopenOccurrenceFromBankPort {
  constructor(private readonly occurrenceRepo: OccurrenceRepositoryPort) {}

  async execute(command: ReopenOccurrenceFromBankCommand): Promise<boolean> {
    const occurrence = await this.occurrenceRepo.findById(command.organizationId, command.occurrenceId);
    if (!occurrence || occurrence.status !== "paid") return false;
    if (occurrence.paymentNotes !== bankPaymentNote(command.movementId)) return false;
    await this.occurrenceRepo.update(command.organizationId, occurrence.reopenPayment());
    return true;
  }
}

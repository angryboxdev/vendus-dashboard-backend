import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type {
  ReopenOccurrenceFromBankCommand,
  ReopenOccurrenceFromBankPort,
  SettleOccurrenceFromBankCommand,
  SettleOccurrenceFromBankPort,
  SettleOccurrenceFromBankResult,
} from "../../domain/ports/in/bank-payment.ports.js";

/** Marca no pagamento qual foi o movimento — é por ela que se sabe se o pode desfazer. */
export const bankPaymentNote = (movementId: string) => `Pago pela conciliação bancária [movimento ${movementId}]`;

export class SettleOccurrenceFromBankUseCase implements SettleOccurrenceFromBankPort {
  constructor(private readonly occurrenceRepo: OccurrenceRepositoryPort) {}

  async execute(command: SettleOccurrenceFromBankCommand): Promise<SettleOccurrenceFromBankResult> {
    const occurrence = await this.occurrenceRepo.findById(command.organizationId, command.occurrenceId);
    if (!occurrence || occurrence.status === "cancelled") return "skipped";
    if (occurrence.status === "paid") return "already_paid";
    // Com fatura (ou à espera dela): o movimento concilia-se com a fatura, que paga a ocorrência em cadeia.
    if (occurrence.invoiceId !== null || occurrence.requireInvoice) return "invoice_required";
    const paid = occurrence.markPaid(new Date(`${command.paidAt}T00:00:00.000Z`), "transfer", command.bankAccountId, bankPaymentNote(command.movementId));
    await this.occurrenceRepo.update(command.organizationId, paid);
    return "paid";
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

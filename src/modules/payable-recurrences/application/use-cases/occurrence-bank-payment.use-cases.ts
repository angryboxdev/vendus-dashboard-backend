import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { BankMovementLinkReadPort } from "../../domain/ports/out/bank-movement-link-read.port.js";
import type { Recurrence } from "../../domain/entities/recurrence.js";
import { OccurrenceGeneratorService } from "../../domain/services/occurrence-generator.service.js";
import type {
  ReopenOccurrenceFromBankCommand,
  ReopenOccurrenceFromBankPort,
  SettleOccurrenceFromBankCommand,
  SettleOccurrenceFromBankPort,
  SettleOccurrenceFromBankResult,
  SettleRecurrenceFromBankCommand,
  SettleRecurrenceFromBankPort,
  SettleRecurrenceFromBankResult,
  GetRecurrenceForBankRulePort,
  RecurrenceForBankRuleDTO,
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

const isBankPaymentNote = (notes: string | null) => notes?.startsWith("Pago pela conciliação bancária [movimento ") ?? false;

function shiftPeriod(year: number, month: number, delta: number): { year: number; month: number } {
  const i = year * 12 + (month - 1) + delta;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

export class SettleRecurrenceFromBankUseCase implements SettleRecurrenceFromBankPort {
  private readonly generator = new OccurrenceGeneratorService();

  constructor(
    private readonly recurrenceRepo: RecurrenceRepositoryPort,
    private readonly occurrenceRepo: OccurrenceRepositoryPort,
    private readonly bankMovementLinkRead: BankMovementLinkReadPort,
  ) {}

  async execute(command: SettleRecurrenceFromBankCommand): Promise<SettleRecurrenceFromBankResult> {
    const { organizationId } = command;
    const recurrence = await this.recurrenceRepo.findById(organizationId, command.recurrenceId);
    if (!recurrence) return { result: "not_applicable", reason: "not_found" };
    if (recurrence.requireInvoice) return { result: "not_applicable", reason: "invoice_required" };

    const [y, m] = command.paidAt.split("-").map(Number) as [number, number];
    const target = shiftPeriod(y, m, recurrence.paymentPeriodOffset);
    const occurrence = await this.findOrGenerate(recurrence, target.year, target.month, organizationId);
    if (!occurrence) return { result: "not_applicable", reason: "no_occurrence" };
    if (occurrence.invoiceId !== null) return { result: "not_applicable", reason: "invoice_required" };

    if (occurrence.status === "forecast") {
      const paid = occurrence.markPaid(new Date(`${command.paidAt}T00:00:00.000Z`), "transfer", command.bankAccountId, bankPaymentNote(command.movementId));
      await this.occurrenceRepo.update(organizationId, paid);
      return { result: "paid", occurrenceId: occurrence.id, period: occurrence.period };
    }
    // Paga à mão (histórico) e ainda sem movimento: o movimento passa a ser o comprovativo, sem mexer no pagamento.
    if (occurrence.status === "paid" && !isBankPaymentNote(occurrence.paymentNotes)) {
      const links = await this.bankMovementLinkRead.findByOccurrenceIds(organizationId, [occurrence.id]);
      if (!links.has(occurrence.id)) return { result: "linked", occurrenceId: occurrence.id, period: occurrence.period };
    }
    return { result: "not_applicable", reason: "not_open" };
  }

  private async findOrGenerate(recurrence: Recurrence, year: number, month: number, organizationId: SettleRecurrenceFromBankCommand["organizationId"]) {
    const period = this.generator.toPeriod(year, month);
    const existing = await this.occurrenceRepo.findByRecurrenceAndPeriod(organizationId, recurrence.id, period);
    if (existing) return existing;
    const generated = this.generator.generateForMonth(recurrence, year, month);
    if (!generated) return null;
    try {
      await this.occurrenceRepo.save(organizationId, generated);
      return generated;
    } catch (e) {
      // Gerada ao mesmo tempo por outro pedido (única por recorrência e mês): usa essa.
      const raced = await this.occurrenceRepo.findByRecurrenceAndPeriod(organizationId, recurrence.id, period);
      if (raced) return raced;
      throw e;
    }
  }
}

export class GetRecurrenceForBankRuleUseCase implements GetRecurrenceForBankRulePort {
  constructor(private readonly recurrenceRepo: RecurrenceRepositoryPort) {}

  async execute(command: { organizationId: SettleRecurrenceFromBankCommand["organizationId"]; recurrenceId: string }): Promise<RecurrenceForBankRuleDTO | null> {
    const r = await this.recurrenceRepo.findById(command.organizationId, command.recurrenceId);
    if (!r) return null;
    return { id: r.id, name: r.name, status: r.status, requireInvoice: r.requireInvoice, paymentPeriodOffset: r.paymentPeriodOffset };
  }
}

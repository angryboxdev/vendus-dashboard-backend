import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { PayableEntryWritePort } from "../../domain/ports/out/payable-entry-write.port.js";
import type { OccurrenceSyncPort } from "../../domain/ports/out/occurrence-sync.port.js";
import type {
  ReopenInvoiceFromBankCommand,
  ReopenInvoiceFromBankPort,
  SettleInvoiceFromBankCommand,
  SettleInvoiceFromBankPort,
} from "../../domain/ports/in/bank-payment.ports.js";

export class SettleInvoiceFromBankUseCase implements SettleInvoiceFromBankPort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly payableWrite: PayableEntryWritePort,
    private readonly occurrenceSync: OccurrenceSyncPort,
  ) {}

  async execute(command: SettleInvoiceFromBankCommand): Promise<void> {
    const invoice = await this.invoiceRepo.findById(command.organizationId, command.invoiceId);
    if (!invoice || invoice.status === "cancelled") return;
    const paidAt = new Date(`${command.paidAt}T00:00:00.000Z`);
    // Já paga à mão antes desta conciliação: fica como está (só se sincroniza o resto).
    if (command.paidByThisReconciliation || invoice.status !== "paid") {
      await this.invoiceRepo.update(command.organizationId, invoice.markPaidByBank(paidAt, command.bankAccountId));
    }
    // Conta a pagar e ocorrência ligadas acompanham, como em «marcar como paga» (idempotente).
    await this.payableWrite.markPaidByInvoiceId(command.organizationId, invoice.id, paidAt);
    await this.occurrenceSync.markPaidByInvoiceId(command.organizationId, invoice.id, paidAt);
  }
}

export class ReopenInvoiceFromBankUseCase implements ReopenInvoiceFromBankPort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly payableWrite: PayableEntryWritePort,
    private readonly occurrenceSync: OccurrenceSyncPort,
  ) {}

  async execute(command: ReopenInvoiceFromBankCommand): Promise<boolean> {
    const invoice = await this.invoiceRepo.findById(command.organizationId, command.invoiceId);
    if (!invoice || !invoice.isPaidByBank) return false;
    await this.invoiceRepo.update(command.organizationId, invoice.reopenBankPayment());
    await this.payableWrite.reopenByInvoiceId(command.organizationId, invoice.id);
    await this.occurrenceSync.reopenByInvoiceId(command.organizationId, invoice.id);
    return true;
  }
}

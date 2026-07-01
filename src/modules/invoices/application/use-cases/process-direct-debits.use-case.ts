import type { ProcessDirectDebitsPort } from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { PayableEntryWritePort } from "../../domain/ports/out/payable-entry-write.port.js";

export class ProcessDirectDebitsUseCase implements ProcessDirectDebitsPort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly payableWrite: PayableEntryWritePort,
  ) {}

  async execute(): Promise<{ processed: number }> {
    const pending = await this.invoiceRepo.findPendingDirectDebits();
    let processed = 0;

    for (const invoice of pending) {
      const paidAt = invoice.directDebitDate!;
      const paid = invoice.markPaid(paidAt);
      await this.invoiceRepo.update(paid);
      await this.payableWrite.markPaidByInvoiceId(invoice.id, paidAt);
      processed++;
    }

    return { processed };
  }
}

import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { InvoiceReadPort } from "../../domain/ports/out/invoice-read.port.js";
import type { ReleaseInvoiceLinksCommand, ReleaseInvoiceLinksPort } from "../../domain/ports/in/invoice-link.ports.js";

/**
 * Fatura apagada: as ocorrências ainda não pagas que apontavam para ela voltam ao
 * previsto (sem isto ficava um valor «real» de uma fatura que já não existe).
 * Num documento de pagamento com mais faturas, a ocorrência continua ligada às que
 * restam e o real passa a ser a soma delas. Pagas ficam como estão — o pagamento é histórico.
 */
export class ReleaseInvoiceLinksUseCase implements ReleaseInvoiceLinksPort {
  constructor(
    private readonly occurrenceRepo: OccurrenceRepositoryPort,
    private readonly invoiceRead: InvoiceReadPort,
  ) {}

  async execute(command: ReleaseInvoiceLinksCommand): Promise<void> {
    const { organizationId, invoiceId, paymentGroupId } = command;
    const remaining = paymentGroupId
      ? (await this.invoiceRead.findByPaymentGroup(organizationId, paymentGroupId)).filter((m) => m.id !== invoiceId)
      : [];
    const remainingTotal = remaining.reduce((sum, m) => sum + m.totalWithVatCents, 0);
    const keepDocument = remaining.length > 0 && remainingTotal > 0;

    // Ocorrência ligada à fatura apagada: passa a outra do documento, ou volta ao previsto.
    for (const occurrence of await this.occurrenceRepo.findAll(organizationId, { invoiceId })) {
      if (occurrence.status !== "invoice_linked") continue;
      const updated = keepDocument ? occurrence.reanchorInvoice(remaining[0]!.id, remainingTotal) : occurrence.unlinkInvoice();
      await this.occurrenceRepo.update(organizationId, updated);
    }

    // Ocorrência ligada a outra fatura do documento: o real deixa de contar a fatura apagada.
    if (!keepDocument) return;
    for (const m of remaining) {
      for (const occurrence of await this.occurrenceRepo.findAll(organizationId, { invoiceId: m.id })) {
        if (occurrence.status !== "invoice_linked" || occurrence.realAmountCents === remainingTotal) continue;
        await this.occurrenceRepo.update(organizationId, occurrence.reanchorInvoice(m.id, remainingTotal));
      }
    }
  }
}

import type { BankMovementEntityLinkRepositoryPort } from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";
import type { InvoiceMatchReadPort } from "../../domain/ports/out/invoice-match-read.port.js";
import type { GetInvoiceOpenBalancesPort } from "../../domain/ports/in/bank-statement.ports.js";

export class GetInvoiceOpenBalancesUseCase implements GetInvoiceOpenBalancesPort {
  constructor(
    private readonly linkRepo: BankMovementEntityLinkRepositoryPort,
    private readonly invoiceRead: InvoiceMatchReadPort,
  ) {}

  async execute(invoiceIds: string[]): Promise<Record<string, number>> {
    if (invoiceIds.length === 0) return {};

    const [invoices, links] = await Promise.all([
      this.invoiceRead.findByIds(invoiceIds),
      this.linkRepo.findByEntityIds("invoice", invoiceIds),
    ]);

    // Sum allocated amounts per invoice
    const allocatedByInvoice = new Map<string, number>();
    for (const l of links) {
      allocatedByInvoice.set(l.entityId, (allocatedByInvoice.get(l.entityId) ?? 0) + l.allocatedAmountCents);
    }

    const result: Record<string, number> = {};
    for (const inv of invoices) {
      const allocated = allocatedByInvoice.get(inv.id) ?? 0;
      result[inv.id] = Math.max(0, inv.totalWithVat - allocated);
    }
    return result;
  }
}

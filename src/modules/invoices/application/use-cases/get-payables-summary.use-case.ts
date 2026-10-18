import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { InvoiceAllocationRepositoryPort } from "../../domain/ports/out/invoice-allocation-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { OrganizationIdentityReadPort } from "../../domain/ports/out/organization-identity-read.port.js";
import type { PayablesLedgerReadPort } from "../../domain/ports/out/payables-ledger-read.port.js";
import { civilDate, summarizePayables, type LedgerDocument, type PayablesSummary, type PayablesSummaryFilter } from "../../domain/services/payables-summary.service.js";

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const NOT_IN_LEDGER = new Set(["draft_ai", "pending_review", "cancelled"]);

/**
 * «Total a pagar | Em atraso» (F2 v1.2 §2.3), agregado no backend sobre o
 * razão: faturas lançadas (uma obrigação por documento — várias contas a
 * pagar da mesma fatura nunca somam duas vezes) e obrigações sem fatura (ex.:
 * recorrentes fiscais/contributivas). Independente da paginação e das abas.
 */
export class GetPayablesSummaryUseCase {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: Pick<InvoiceLineRepositoryPort, "findAll">,
    private readonly allocationRepo: Pick<InvoiceAllocationRepositoryPort, "findAll">,
    private readonly ledger: PayablesLedgerReadPort,
    private readonly organization: Pick<OrganizationIdentityReadPort, "getTimezone">,
  ) {}

  async execute(organizationId: OrganizationId, filter: PayablesSummaryFilter, now: Date = new Date()): Promise<PayablesSummary> {
    const [invoices, payables, allocated, lines, allocations, timezone] = await Promise.all([
      this.invoiceRepo.findAll(organizationId),
      this.ledger.listActivePayables(organizationId),
      this.ledger.allocatedByEntity(organizationId),
      filter.locationId ? this.lineRepo.findAll(organizationId) : Promise.resolve([]),
      filter.locationId ? this.allocationRepo.findAll(organizationId) : Promise.resolve([]),
      this.organization.getTimezone(organizationId),
    ]);

    const locations = new Map<string, Set<string>>();
    const addLoc = (invoiceId: string, loc: string | null) => {
      if (!loc) return;
      const set = locations.get(invoiceId) ?? new Set<string>();
      set.add(loc);
      locations.set(invoiceId, set);
    };
    for (const l of lines) addLoc(l.invoiceId, l.locationId);
    for (const a of allocations) addLoc(a.invoiceId, a.locationId);

    const payablesByInvoice = new Map<string, typeof payables>();
    for (const p of payables) if (p.invoiceId) payablesByInvoice.set(p.invoiceId, [...(payablesByInvoice.get(p.invoiceId) ?? []), p]);

    const docs: LedgerDocument[] = [];
    for (const inv of invoices) {
      if (NOT_IN_LEDGER.has(inv.status)) continue;
      const own = payablesByInvoice.get(inv.id) ?? [];
      const allocatedCents = Math.abs(allocated.invoice.get(inv.id) ?? 0) + own.reduce((s, p) => s + Math.abs(allocated.payable.get(p.id) ?? 0), 0);
      docs.push({
        id: inv.id,
        kind: "invoice",
        documentType: inv.documentType,
        settled: inv.status === "paid" || (own.length > 0 && own.every((p) => p.status === "paid")),
        totalCents: Math.abs(inv.totalWithVat),
        allocatedCents,
        dueDate: ymd(inv.dueDate) ?? own.find((p) => p.dueDate)?.dueDate ?? ymd(inv.directDebitDate),
        listingDate: ymd(inv.invoiceDate),
        currency: inv.currency || "EUR",
        supplierId: inv.supplierId,
        searchText: `${inv.supplierName} ${inv.invoiceNumber}`,
        locationIds: locations.get(inv.id) ?? new Set(),
        duplicateWarning: own.length > 1,
      });
    }
    // Obrigações sem fatura (mesmo razão): contam uma vez, pelo seu saldo.
    for (const p of payables) {
      if (p.invoiceId) continue;
      docs.push({
        id: p.id,
        kind: "obligation",
        documentType: "invoice",
        settled: p.status === "paid",
        totalCents: Math.abs(p.amountCents),
        allocatedCents: Math.abs(allocated.payable.get(p.id) ?? 0),
        dueDate: p.dueDate,
        listingDate: p.dueDate,
        currency: "EUR",
        supplierId: p.supplierId,
        searchText: `${p.supplierName} ${p.description}`,
        locationIds: new Set(),
        duplicateWarning: false,
      });
    }
    return summarizePayables(docs, filter, civilDate(now, timezone));
  }
}

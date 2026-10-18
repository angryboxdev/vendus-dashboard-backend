import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetPayablesSummaryUseCase } from "../../application/use-cases/get-payables-summary.use-case.js";
import { Invoice } from "../../domain/entities/invoice.js";
import type { LedgerPayable, PayablesLedgerReadPort } from "../../domain/ports/out/payables-ledger-read.port.js";
import { FakeInvoiceAllocationRepository } from "../fakes/fake-invoice-allocation-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeOrganizationIdentityRead } from "../fakes/fake-organization-identity-read.port.js";

const ORG = mintOrganizationId("org-test");

class FakeLedger implements PayablesLedgerReadPort {
  payables: LedgerPayable[] = [];
  invoiceAlloc = new Map<string, number>();
  payableAlloc = new Map<string, number>();
  async listActivePayables() {
    return this.payables;
  }
  async allocatedByEntity() {
    return { invoice: this.invoiceAlloc, payable: this.payableAlloc };
  }
}

const inv = (n: string, total: number, due: string | null) =>
  Invoice.create({ supplierName: "Makro", invoiceNumber: n, invoiceDate: new Date("2026-10-01"), dueDate: due ? new Date(due) : null, subtotalWithoutVat: total, totalVat: 0, totalWithVat: total });

describe("GetPayablesSummaryUseCase (razão)", () => {
  test("uma obrigação por documento: duas contas a pagar da mesma fatura não somam duas vezes; obrigação sem fatura conta; rascunho não conta", async () => {
    const repo = new FakeInvoiceRepository();
    const ledger = new FakeLedger();
    const a = inv("FT 1", 20000, "2026-10-10");
    const b = inv("FT 2", 10000, "2026-10-30");
    const draft = Invoice.createFromImport({ supplierName: "X", supplierNifSnapshot: null, invoiceNumber: "R1", invoiceDate: new Date("2026-10-01"), dueDate: null, subtotalWithoutVat: 99900, totalVat: 0, totalWithVat: 99900, source: "pdf_import", attachmentUrl: null, aiConfidence: 0.9, requiresReview: true });
    for (const i of [a, b, draft]) await repo.save(ORG, i);
    ledger.payables = [
      { id: "p1", invoiceId: a.id, status: "pending", amountCents: 20000, dueDate: "2026-10-10", supplierId: null, supplierName: "Makro", description: "FT 1" },
      { id: "p1-dup", invoiceId: a.id, status: "pending", amountCents: 20000, dueDate: "2026-10-10", supplierId: null, supplierName: "Makro", description: "FT 1" },
      { id: "ss", invoiceId: null, status: "pending", amountCents: 30000, dueDate: "2026-10-20", supplierId: null, supplierName: "Segurança Social", description: "Contribuições setembro" },
    ];
    ledger.payableAlloc.set("p1", 5000); // pagamento reconhecido de 50 €
    const uc = new GetPayablesSummaryUseCase(repo, new FakeInvoiceLineRepository(), new FakeInvoiceAllocationRepository(), ledger, new FakeOrganizationIdentityRead());
    const r = await uc.execute(ORG, {}, new Date("2026-10-14T12:00:00Z"));
    expect(r).toMatchObject({ today: "2026-10-14", totalOpenCents: 15000 + 10000 + 30000, overdueCents: 15000, suspectedDuplicates: 1, documents: 3 });
  });
});

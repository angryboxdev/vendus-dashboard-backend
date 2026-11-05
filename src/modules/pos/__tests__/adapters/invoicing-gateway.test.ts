import { dec, decToString } from "../../../../kernel/money/decimal.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { IssueDocumentUseCase } from "../../../invoicing/application/use-cases/issue-document.use-case.js";
import { FakeInvoicingStore, FakeIssuers, FakeSigner, FixedClock } from "../../../invoicing/__tests__/fakes/fakes.js";
import { InvoicingGateway } from "../../adapters/out/invoicing-gateway.js";
import { PosRuleError } from "../../domain/errors.js";
import { priceSale } from "../../domain/services/sale-pricing.service.js";
import type { PosProduct } from "../../domain/entities/pos.js";

/**
 * Contrato POS ↔ faturação com o caso de uso real de emissão (fakes da BD e
 * do assinador): o total da FR gravada é o total que o POS mostrou.
 */
const ORG = mintOrganizationId("b6999cff-79b2-4583-b8b4-a744b3ace748");
const NOW = { systemEntryDate: "2027-03-10T12:00:00", date: "2027-03-10", instant: "2027-03-10T12:00:00.000Z" };

function setup() {
  const store = new FakeInvoicingStore();
  for (const type of ["FR", "NC"] as const) {
    store.series.set(`serie-${type}`, { ref: `serie-${type}`, legalEntityId: "le-1", locationId: null, documentType: type, seriesId: "POS-2027", mode: "training", validationCode: "CDF7T5HD", lastSequence: 0, lastHash: null, lastDocumentDate: null, lastSystemEntryAt: null });
  }
  const issue = new IssueDocumentUseCase({ store, certificateNumber: null, simplifiedInvoiceLimitNet: dec("100"), signer: new FakeSigner(), clock: new FixedClock(NOW), issuers: new FakeIssuers() });
  const gateway = new InvoicingGateway({
    issue: (org, req) => issue.execute(org, { ...req, confirmWarnings: false }),
    document: async (_org, id) => {
      const r = store.saved[Number(id.replace("doc-", "")) - 1]!;
      store.summaries.set(id, { id, legalEntityId: "le-1", documentType: "FR", seriesMode: "training", customerTaxId: r.customer.taxId, documentNumber: r.documentNumber, documentDate: r.documentDate, status: "N", grossTotal: r.totals.grossTotal });
      return { grossTotal: decToString(r.totals.grossTotal), customer: { taxId: r.customer.taxId, name: r.customer.name } };
    },
  });
  return { store, gateway };
}

const product = (over: Partial<PosProduct>): PosProduct => ({ id: "p", ref: "VPIZ1", name: "Pizza Teste", category: null, priceCents: 1850, vatRate: 13, productType: "P", trackStock: false, stockQty: 0, barcode: null, imageUrl: null, active: true, ...over });

describe("POS → motor de faturação (FR de formação)", () => {
  it("desconto por linha e na venda: o total gravado é o do POS, ao cêntimo", async () => {
    const { gateway, store } = setup();
    const priced = priceSale(
      [
        { product: product({ id: "p1" }), quantity: 3, discount: { kind: "eur", value: 1.37 } },
        { product: product({ id: "p2", ref: "VREF2", name: "Refrigerante", priceCents: 250, vatRate: 23 }), quantity: 2 },
        { product: product({ id: "p3", ref: "VAGU3", name: "Água", priceCents: 150, vatRate: 6 }), quantity: 1 },
      ],
      { kind: "pct", value: 7 },
    );
    const doc = await gateway.issueInvoiceReceipt(ORG, {
      seriesRef: "serie-FR",
      lines: priced.lines.map((l) => ({ productCode: l.product.ref, productType: "P", description: l.product.name, quantity: l.quantity, unitPrice: (l.product.priceCents / 100).toFixed(2), discountPct: l.discountPct, vatRate: l.product.vatRate })),
      paymentMechanism: "NU",
      customer: null,
      actor: "11111111-1111-4111-8111-111111111111",
    });
    expect(doc.totalCents).toBe(priced.totalCents);
    expect(store.saved[0]).toMatchObject({ documentNumber: "FR POS-2027/1", paymentMechanism: "NU" });
  });

  it("NC parcial refere a FR; regra fiscal recusada vira erro do POS", async () => {
    const { gateway } = setup();
    const line = { productCode: "VREF2", productType: "P" as const, description: "Refrigerante", quantity: 2, unitPrice: "2.50", discountPct: null, vatRate: 23 };
    const fr = await gateway.issueInvoiceReceipt(ORG, { seriesRef: "serie-FR", lines: [line], paymentMechanism: "CD", customer: null, actor: "u1" });
    const nc = await gateway.issueCreditNote(ORG, { seriesRef: "serie-NC", lines: [{ ...line, quantity: 1 }], referenceDocumentId: fr.documentId, reason: "Devolução do cliente", customer: null, actor: "u1" });
    expect(nc).toMatchObject({ documentNumber: "NC POS-2027/1", totalCents: 250 });
    await expect(gateway.issueInvoiceReceipt(ORG, { seriesRef: "serie-XX", lines: [line], paymentMechanism: "CD", customer: null, actor: "u1" })).rejects.toBeInstanceOf(PosRuleError);
  });
});

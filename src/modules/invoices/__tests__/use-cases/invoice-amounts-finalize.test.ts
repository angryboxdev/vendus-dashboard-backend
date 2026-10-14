import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ConfirmImportedInvoiceUseCase } from "../../application/use-cases/confirm-imported-invoice.use-case.js";
import { CreateInvoiceUseCase } from "../../application/use-cases/create-invoice.use-case.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceAmountsNotReconciledError } from "../../domain/errors.js";
import { FakeFiscalIdentityPort } from "../fakes/fake-fiscal-identity.port.js";
import { FakeInvoiceAmountsWrite } from "../fakes/fake-invoice-amounts-write.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakePayableEntryWrite } from "../fakes/fake-payable-entry-write.js";
import { FakeSupplierCreatePort } from "../fakes/fake-supplier-create.port.js";
import { FakeSupplierHintPort } from "../fakes/fake-supplier-hint.port.js";
import { FakeSupplierLookupPort } from "../fakes/fake-supplier-lookup.port.js";

const ORG = mintOrganizationId("org-test");
const notify = { notifyInvoiceFinalized: async () => {} };
const draft = (totalWithVat: number) =>
  Invoice.createFromImport({
    supplierName: "Fornecedor Teste",
    supplierNifSnapshot: "503504564",
    invoiceNumber: "FT 2026/64311",
    invoiceDate: new Date("2026-10-01"),
    dueDate: new Date("2026-10-31"),
    // Valores do cliente propositadamente errados: o servidor recalcula.
    subtotalWithoutVat: 12400,
    totalVat: 744,
    totalWithVat,
    source: "pdf_import",
    attachmentUrl: null,
    aiConfidence: 0.9,
    requiresReview: false,
  });
const mozzarella = { description: "Mozzarella", quantity: 20, unitCostWithoutVat: 620, vatRate: 6, vatAmount: 744, totalWithVat: 13144, discount: { kind: "pct" as const, value: 10 } };

function setup() {
  const invoiceRepo = new FakeInvoiceRepository();
  const lineRepo = new FakeInvoiceLineRepository();
  const payableWrite = new FakePayableEntryWrite();
  const amountsWrite = new FakeInvoiceAmountsWrite();
  const confirm = new ConfirmImportedInvoiceUseCase(invoiceRepo, lineRepo, payableWrite, new FakeSupplierCreatePort(), new FakeSupplierHintPort(), notify, new FakeFiscalIdentityPort(), new FakeSupplierLookupPort(), amountsWrite);
  const create = new CreateInvoiceUseCase(invoiceRepo, lineRepo, payableWrite, notify, new FakeFiscalIdentityPort(), new FakeSupplierLookupPort(), amountsWrite);
  return { invoiceRepo, lineRepo, payableWrite, amountsWrite, confirm, create };
}

describe("Finalizar fatura com o motor único de valores (F1 §1.3)", () => {
  test("Mozzarella na confirmação: servidor recalcula base 111,60, IVA 6,70, total 118,30 e grava descontos e quadro de IVA", async () => {
    const s = setup();
    const inv = draft(11830);
    await s.invoiceRepo.save(ORG, inv);
    const r = await s.confirm.execute({ organizationId: ORG, id: inv.id, lines: [mozzarella], saveAsPayable: true });
    expect(r.subtotalWithoutVat).toBe(11160);
    expect(r.totalVat).toBe(670);
    expect(r.totalWithVat).toBe(11830);
    const [line] = await s.lineRepo.findByInvoiceId(ORG, inv.id);
    expect(line).toMatchObject({ vatAmount: 670, totalWithVat: 11830 });
    const rec = s.amountsWrite.saved.get(inv.id)!;
    expect(rec).toMatchObject({ grossCents: 12400, discountCents: 1240, differenceCents: 0, vatSummary: [{ rate: "6", baseCents: 11160, vatCents: 670 }] });
    expect(rec.validatedAt).toBeInstanceOf(Date);
    expect(rec.lines[0]).toMatchObject({ grossCents: 12400, discountKind: "pct", discountValue: 10, discountCents: 1240, netCents: 11160 });
  });

  test("divergência real bloqueia a confirmação: rascunho intacto, sem linhas, sem conta a pagar", async () => {
    const s = setup();
    const inv = draft(11900);
    await s.invoiceRepo.save(ORG, inv);
    const err = await s.confirm.execute({ organizationId: ORG, id: inv.id, lines: [mozzarella], saveAsPayable: true }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvoiceAmountsNotReconciledError);
    expect(err).toMatchObject({ details: { differenceCents: 70 } });
    expect((await s.invoiceRepo.findById(ORG, inv.id))!.status).toBe("draft_ai");
    expect(await s.lineRepo.findByInvoiceId(ORG, inv.id)).toEqual([]);
    expect(s.payableWrite.created ?? []).toEqual([]);
  });

  test("ajuste de arredondamento de 1 cêntimo com motivo permite finalizar e fica registado", async () => {
    const s = setup();
    const inv = draft(11831);
    await s.invoiceRepo.save(ORG, inv);
    await s.confirm.execute({ organizationId: ORG, id: inv.id, lines: [mozzarella], amounts: { roundingAdjustment: { cents: 1, reason: "Arredondamento do fornecedor" } } });
    expect(s.amountsWrite.saved.get(inv.id)).toMatchObject({ roundingAdjustmentCents: 1, roundingAdjustmentReason: "Arredondamento do fornecedor", differenceCents: 1 });
  });

  test("criar manualmente sem linhas: base + IVA tem de dar o total; senão nada é criado", async () => {
    const s = setup();
    const base = { organizationId: ORG, supplierName: "Fornecedor Teste", invoiceNumber: "FT 1", invoiceDate: "2026-10-01", dueDate: "2026-10-31", subtotalWithoutVat: 10000, totalVat: 2300 };
    await expect(s.create.execute({ ...base, totalWithVat: 12400 })).rejects.toBeInstanceOf(InvoiceAmountsNotReconciledError);
    expect(await s.invoiceRepo.findAll(ORG)).toEqual([]);
    const ok = await s.create.execute({ ...base, totalWithVat: 12300 });
    expect(s.amountsWrite.saved.get(ok.id)).toMatchObject({ differenceCents: 0 });
  });

  test("nota de crédito: calcula em valor absoluto e mantém os totais negativos", async () => {
    const s = setup();
    const r = await s.create.execute({
      organizationId: ORG, supplierName: "Fornecedor Teste", invoiceNumber: "NC 1", invoiceDate: "2026-10-01",
      documentType: "credit_note", subtotalWithoutVat: -11160, totalVat: -670, totalWithVat: -11830,
      lines: [{ ...mozzarella, vatAmount: -670, totalWithVat: -11830 }],
    });
    expect(r).toMatchObject({ subtotalWithoutVat: -11160, totalVat: -670, totalWithVat: -11830 });
  });
});

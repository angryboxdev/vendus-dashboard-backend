import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { GenerateOccurrenceUseCase } from "../../application/use-cases/generate-occurrence.use-case.js";
import { LinkInvoiceToOccurrenceUseCase } from "../../application/use-cases/link-invoice-to-occurrence.use-case.js";
import { GetRecurrenceSummaryUseCase } from "../../application/use-cases/get-summary.use-case.js";
import { GetLinkedInvoiceIdsUseCase } from "../../application/use-cases/get-linked-invoice-ids.use-case.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";
import { FakeOccurrenceRepository } from "../fakes/fake-occurrence-repository.js";
import { FakeInvoiceRead } from "../fakes/fake-invoice-read.js";

const organizationId = mintOrganizationId("org-a");

const FIXED_CMD = {
  organizationId,
  name: "Contabilidade",
  supplierName: "Contabilista Lda",
  type: "fixed_contract" as const,
  estimatedAmountCents: 25000,
  dayOfMonth: 10,
  startDate: "2026-01-01",
  paymentMethod: "transfer" as const,
};

const VARIABLE_CMD = {
  organizationId,
  name: "Energia",
  supplierName: "Gold Energy",
  type: "variable_invoice" as const,
  estimatedAmountCents: 26000,
  dayOfMonth: 20,
  startDate: "2026-01-01",
  paymentMethod: "transfer" as const,
  requireInvoice: true,
};

function make() {
  const recurrenceRepo = new FakeRecurrenceRepository();
  const occurrenceRepo = new FakeOccurrenceRepository();
  const invoiceRead = new FakeInvoiceRead();
  return {
    recurrenceRepo,
    occurrenceRepo,
    invoiceRead,
    create: new CreateRecurrenceUseCase(recurrenceRepo),
    generate: new GenerateOccurrenceUseCase(recurrenceRepo, occurrenceRepo),
    link: new LinkInvoiceToOccurrenceUseCase(occurrenceRepo, invoiceRead),
    getSummary: new GetRecurrenceSummaryUseCase(occurrenceRepo),
    getLinkedIds: new GetLinkedInvoiceIdsUseCase(occurrenceRepo),
  };
}

// ── GetRecurrenceSummaryUseCase ───────────────────────────────────────────────

describe("GetRecurrenceSummaryUseCase", () => {
  it("retorna zero quando não há ocorrências", async () => {
    const { getSummary } = make();
    const result = await getSummary.execute({ organizationId });
    expect(result.awaitingInvoiceCount).toBe(0);
  });

  it("conta ocorrências em awaiting_invoice (variable_invoice)", async () => {
    const { create, generate, getSummary } = make();
    const rec = await create.execute(VARIABLE_CMD);
    await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 7 });
    await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 8 });

    const result = await getSummary.execute({ organizationId });
    expect(result.awaitingInvoiceCount).toBe(2);
  });

  it("não conta ocorrências em forecast (fixed_contract)", async () => {
    const { create, generate, getSummary } = make();
    const rec = await create.execute(FIXED_CMD);
    await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 7 });

    const result = await getSummary.execute({ organizationId });
    expect(result.awaitingInvoiceCount).toBe(0);
  });

  it("mistura: conta apenas awaiting_invoice", async () => {
    const { create, generate, getSummary } = make();
    const fixed = await create.execute(FIXED_CMD);
    const variable = await create.execute(VARIABLE_CMD);
    await generate.execute({ organizationId, recurrenceId: fixed.id, year: 2026, month: 7 });
    await generate.execute({ organizationId, recurrenceId: variable.id, year: 2026, month: 7 });
    await generate.execute({ organizationId, recurrenceId: variable.id, year: 2026, month: 8 });

    const result = await getSummary.execute({ organizationId });
    // 1 forecast (fixed) + 2 awaiting_invoice (variable) → conta só os 2
    expect(result.awaitingInvoiceCount).toBe(2);
  });

  it("não conta ocorrências de outra organização", async () => {
    const { create, generate, getSummary } = make();
    const rec = await create.execute(VARIABLE_CMD);
    await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 7 });
    const otherOrganizationId = mintOrganizationId("org-b");

    const result = await getSummary.execute({ organizationId: otherOrganizationId });
    expect(result.awaitingInvoiceCount).toBe(0);
  });
});

// ── GetLinkedInvoiceIdsUseCase ────────────────────────────────────────────────

describe("GetLinkedInvoiceIdsUseCase", () => {
  it("retorna array vazio quando não há ocorrências com fatura", async () => {
    const { getLinkedIds } = make();
    const result = await getLinkedIds.execute({ organizationId });
    expect(result).toHaveLength(0);
  });

  it("retorna os invoice IDs vinculados", async () => {
    const { create, generate, link, invoiceRead, getLinkedIds } = make();
    const rec = await create.execute(VARIABLE_CMD);
    const occ1 = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 7 });
    const occ2 = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 8 });

    invoiceRead.seed(organizationId, { id: "inv-100", supplierId: null, supplierName: "Gold Energy", totalWithVatCents: 26000, dueDate: "2026-07-20", status: "pending", paidAt: null });
    invoiceRead.seed(organizationId, { id: "inv-200", supplierId: null, supplierName: "Gold Energy", totalWithVatCents: 27000, dueDate: "2026-08-20", status: "pending", paidAt: null });

    await link.execute({ organizationId, occurrenceId: occ1.id, invoiceId: "inv-100" });
    await link.execute({ organizationId, occurrenceId: occ2.id, invoiceId: "inv-200" });

    const result = await getLinkedIds.execute({ organizationId });
    expect(result).toHaveLength(2);
    expect(result).toContain("inv-100");
    expect(result).toContain("inv-200");
  });

  it("não inclui ocorrências sem fatura vinculada", async () => {
    const { create, generate, link, invoiceRead, getLinkedIds } = make();
    const rec = await create.execute(VARIABLE_CMD);
    const occ1 = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 7 });
    await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 8 }); // sem vínculo

    invoiceRead.seed(organizationId, { id: "inv-100", supplierId: null, supplierName: "Gold Energy", totalWithVatCents: 26000, dueDate: "2026-07-20", status: "pending", paidAt: null });
    await link.execute({ organizationId, occurrenceId: occ1.id, invoiceId: "inv-100" });

    const result = await getLinkedIds.execute({ organizationId });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("inv-100");
  });
});

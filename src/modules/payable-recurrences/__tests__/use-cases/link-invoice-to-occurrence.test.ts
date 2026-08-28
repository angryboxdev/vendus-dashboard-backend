import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { GenerateOccurrenceUseCase } from "../../application/use-cases/generate-occurrence.use-case.js";
import { LinkInvoiceToOccurrenceUseCase } from "../../application/use-cases/link-invoice-to-occurrence.use-case.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";
import { FakeOccurrenceRepository } from "../fakes/fake-occurrence-repository.js";
import { FakeInvoiceRead } from "../fakes/fake-invoice-read.js";
import { OccurrenceNotFoundError, InvoiceAlreadyLinkedError } from "../../domain/errors.js";

const organizationId = mintOrganizationId("org-a");

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
  };
}

const VARIABLE_CMD = {
  organizationId,
  name: "Energia - Gold Energy",
  supplierName: "Gold Energy",
  type: "variable_invoice" as const,
  estimatedAmountCents: 26175,
  dayOfMonth: 20,
  startDate: "2026-01-01",
  paymentMethod: "transfer" as const,
};

describe("LinkInvoiceToOccurrenceUseCase", () => {
  it("liga fatura à ocorrência → status invoice_linked e realAmountCents definido", async () => {
    const { create, generate, link, invoiceRead } = make();

    const rec = await create.execute(VARIABLE_CMD);
    const occ = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 9 });

    invoiceRead.seed(organizationId, {
      id: "inv-1",
      supplierId: "sup-1",
      supplierName: "Gold Energy",
      totalWithVatCents: 28000,
      dueDate: "2026-09-25",
      status: "pending",
      paidAt: null,
    });

    const linked = await link.execute({ organizationId, occurrenceId: occ.id, invoiceId: "inv-1" });

    expect(linked.status).toBe("invoice_linked");
    expect(linked.invoiceId).toBe("inv-1");
    expect(linked.realAmountCents).toBe(28000);
    expect(linked.effectiveAmountCents).toBe(28000);
  });

  it("lança erro se ocorrência não existe", async () => {
    const { link, invoiceRead } = make();
    invoiceRead.seed(organizationId, {
      id: "inv-1",
      supplierId: null,
      supplierName: "X",
      totalWithVatCents: 100,
      dueDate: null,
      status: "pending",
      paidAt: null,
    });
    await expect(link.execute({ organizationId, occurrenceId: "nao-existe", invoiceId: "inv-1" }))
      .rejects.toThrow(OccurrenceNotFoundError);
  });

  it("lança OccurrenceNotFoundError se a ocorrência pertence a outra organização", async () => {
    const { create, generate, link, invoiceRead } = make();
    const rec = await create.execute(VARIABLE_CMD);
    const occ = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 9 });
    const otherOrganizationId = mintOrganizationId("org-b");
    invoiceRead.seed(otherOrganizationId, {
      id: "inv-1",
      supplierId: null,
      supplierName: "X",
      totalWithVatCents: 100,
      dueDate: null,
      status: "pending",
      paidAt: null,
    });

    await expect(
      link.execute({ organizationId: otherOrganizationId, occurrenceId: occ.id, invoiceId: "inv-1" }),
    ).rejects.toThrow(OccurrenceNotFoundError);
  });

  it("lança erro se fatura não existe", async () => {
    const { create, generate, link } = make();
    const rec = await create.execute(VARIABLE_CMD);
    const occ = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 9 });
    await expect(link.execute({ organizationId, occurrenceId: occ.id, invoiceId: "inv-inexistente" }))
      .rejects.toThrow(/Invoice "inv-inexistente" not found/);
  });

  it("lança InvoiceAlreadyLinkedError se a fatura já está associada a outra ocorrência", async () => {
    const { create, generate, link, invoiceRead } = make();

    invoiceRead.seed(organizationId, {
      id: "inv-1",
      supplierId: null,
      supplierName: "X",
      totalWithVatCents: 100,
      dueDate: null,
      status: "pending",
      paidAt: null,
    });

    const rec = await create.execute(VARIABLE_CMD);
    const occ1 = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 7 });
    const occ2 = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 8 });

    // Link inv-1 to occ1
    await link.execute({ organizationId, occurrenceId: occ1.id, invoiceId: "inv-1" });

    // Attempt to link the same invoice to occ2 → should fail
    await expect(link.execute({ organizationId, occurrenceId: occ2.id, invoiceId: "inv-1" }))
      .rejects.toThrow(InvoiceAlreadyLinkedError);
  });
});

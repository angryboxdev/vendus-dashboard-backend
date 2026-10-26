import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { LinkInvoiceToOccurrenceUseCase } from "../../application/use-cases/link-invoice-to-occurrence.use-case.js";
import { LinkInvoiceToRecurrenceUseCase } from "../../application/use-cases/link-invoice-to-recurrence.use-case.js";
import { AutoLinkInvoiceUseCase } from "../../application/use-cases/auto-link-invoice.use-case.js";
import { GetInvoiceRecurrenceStatusUseCase } from "../../application/use-cases/get-invoice-recurrence-status.use-case.js";
import { ReleaseInvoiceLinksUseCase } from "../../application/use-cases/release-invoice-links.use-case.js";
import { GetLinkedInvoiceIdsUseCase } from "../../application/use-cases/get-linked-invoice-ids.use-case.js";
import { ListOccurrencesUseCase } from "../../application/use-cases/list-occurrences.use-case.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";
import { FakeOccurrenceRepository } from "../fakes/fake-occurrence-repository.js";
import { FakeInvoiceRead } from "../fakes/fake-invoice-read.js";
import { FakeEmployeeDirectoryRead } from "../fakes/fake-employee-directory-read.js";
import { FakeBankMovementLinkReadAdapter } from "../fakes/fake-bank-movement-link-read.js";
import { FakeInvoiceAllocatedAmountReadAdapter } from "../fakes/fake-invoice-allocated-amount-read.js";
import { InvoiceAlreadyLinkedError } from "../../domain/errors.js";

const organizationId = mintOrganizationId("org-a");

// Dados fictícios: documento de pagamento das águas = fatura da água (fornecedor da água) +
// fatura dos resíduos (outro emitente), um só débito de 90,03 €.
const GROUP = "grp-agua-out";
const WATER = { id: "inv-agua", supplierId: "sup-agua", supplierName: "Águas Exemplo", invoiceDate: "2026-10-19", totalWithVatCents: 5998, dueDate: "2026-11-03", status: "pending", paidAt: null, paymentGroupId: GROUP };
const WASTE = { id: "inv-residuos", supplierId: "sup-residuos", supplierName: "Resíduos Exemplo", invoiceDate: "2026-10-19", totalWithVatCents: 3005, dueDate: "2026-11-03", status: "pending", paidAt: null, paymentGroupId: GROUP };

function make() {
  const recurrenceRepo = new FakeRecurrenceRepository();
  const occurrenceRepo = new FakeOccurrenceRepository();
  const invoiceRead = new FakeInvoiceRead();
  invoiceRead.seed(organizationId, WATER);
  invoiceRead.seed(organizationId, WASTE);
  const allocations = new FakeInvoiceAllocatedAmountReadAdapter();
  const linkOcc = new LinkInvoiceToOccurrenceUseCase(occurrenceRepo, invoiceRead);
  const linkRec = new LinkInvoiceToRecurrenceUseCase(recurrenceRepo, occurrenceRepo, linkOcc);
  return {
    occurrenceRepo,
    invoiceRead,
    allocations,
    create: new CreateRecurrenceUseCase(recurrenceRepo, new FakeEmployeeDirectoryRead()),
    linkRec,
    auto: new AutoLinkInvoiceUseCase(recurrenceRepo, occurrenceRepo, invoiceRead, linkRec),
    status: new GetInvoiceRecurrenceStatusUseCase(recurrenceRepo, occurrenceRepo, invoiceRead),
    release: new ReleaseInvoiceLinksUseCase(occurrenceRepo, invoiceRead),
    linkedIds: new GetLinkedInvoiceIdsUseCase(occurrenceRepo, invoiceRead),
    list: new ListOccurrencesUseCase(occurrenceRepo, new FakeBankMovementLinkReadAdapter(), allocations, invoiceRead),
  };
}

const WATER_RECURRENCE = {
  organizationId,
  name: "Água",
  supplierId: "sup-agua",
  supplierName: "Águas Exemplo",
  type: "variable_invoice" as const,
  estimatedAmountCents: 9000,
  dayOfMonth: 3,
  startDate: "2026-01-01",
  paymentMethod: "direct_debit" as const,
};

describe("Recorrência do pagamento — documento com várias faturas", () => {
  it("a fatura dos resíduos (outro fornecedor) associa o documento à recorrência «Água»; real = soma", async () => {
    const s = make();
    const rec = await s.create.execute(WATER_RECURRENCE);

    const result = await s.auto.execute({ organizationId, invoiceId: "inv-residuos" });
    expect(result.outcome).toBe("linked");
    const occ = await s.occurrenceRepo.findByRecurrenceAndPeriod(organizationId, rec.id, "2026-10");
    expect(occ?.realAmountCents).toBe(9003);

    // A outra fatura do documento já conta como associada (não volta a associar nem sugere).
    expect((await s.auto.execute({ organizationId, invoiceId: "inv-agua" })).outcome).toBe("already_linked");
    const status = await s.status.execute({ organizationId, invoiceId: "inv-agua" });
    expect(status.linked?.recurrenceName).toBe("Água");
    expect(status.candidates).toEqual([]);
  });

  it("sugestões: desvio calculado sobre o documento inteiro", async () => {
    const s = make();
    await s.create.execute(WATER_RECURRENCE);
    await s.create.execute({ ...WATER_RECURRENCE, name: "Água armazém" });
    const status = await s.status.execute({ organizationId, invoiceId: "inv-residuos" });
    expect(status.candidates.map((c) => [c.recurrenceName, c.deviationPercent])).toEqual([
      ["Água", 0],
      ["Água armazém", 0],
    ]);
  });

  it("nenhuma fatura do documento pode já estar noutra ocorrência", async () => {
    const s = make();
    const a = await s.create.execute(WATER_RECURRENCE);
    const b = await s.create.execute({ ...WATER_RECURRENCE, name: "Outra" });
    await s.linkRec.execute({ organizationId, invoiceId: "inv-agua", recurrenceId: a.id, period: "2026-10" });
    await expect(s.linkRec.execute({ organizationId, invoiceId: "inv-residuos", recurrenceId: b.id, period: "2026-10" }))
      .rejects.toThrow(InvoiceAlreadyLinkedError);
  });

  it("«Pago» soma as conciliações bancárias de todas as faturas do documento", async () => {
    const s = make();
    await s.create.execute(WATER_RECURRENCE);
    const { occurrenceId } = await s.auto.execute({ organizationId, invoiceId: "inv-agua" });
    s.allocations.seedAllocatedAmount(organizationId, "inv-agua", 5998);
    s.allocations.seedAllocatedAmount(organizationId, "inv-residuos", 3005);
    const [dto] = await s.list.execute({ organizationId, invoiceId: "inv-agua" });
    expect(dto?.id).toBe(occurrenceId);
    expect(dto?.paidAmountCents).toBe(9003);
    expect(dto?.displayState).toBe("paid");
  });

  it("faturas do documento contam como já associadas (seletor de faturas)", async () => {
    const s = make();
    await s.create.execute(WATER_RECURRENCE);
    await s.auto.execute({ organizationId, invoiceId: "inv-agua" });
    expect((await s.linkedIds.execute({ organizationId })).sort()).toEqual(["inv-agua", "inv-residuos"]);
  });

  it("apagar uma fatura do documento: a ocorrência fica com as que restam (real recalculado)", async () => {
    const s = make();
    await s.create.execute(WATER_RECURRENCE);
    const { occurrenceId } = await s.auto.execute({ organizationId, invoiceId: "inv-agua" });

    // Apaga-se a fatura de ligação: passa à dos resíduos, real = 30,05 €.
    s.invoiceRead.remove(organizationId, "inv-agua");
    await s.release.execute({ organizationId, invoiceId: "inv-agua", paymentGroupId: GROUP });
    let occ = await s.occurrenceRepo.findById(organizationId, occurrenceId!);
    expect(occ).toMatchObject({ invoiceId: "inv-residuos", realAmountCents: 3005, status: "invoice_linked" });

    // Apaga-se a última: volta ao previsto.
    s.invoiceRead.remove(organizationId, "inv-residuos");
    await s.release.execute({ organizationId, invoiceId: "inv-residuos", paymentGroupId: GROUP });
    occ = await s.occurrenceRepo.findById(organizationId, occurrenceId!);
    expect(occ).toMatchObject({ invoiceId: null, realAmountCents: null });
  });

  it("apagar a outra fatura (não a de ligação) recalcula o real", async () => {
    const s = make();
    await s.create.execute(WATER_RECURRENCE);
    const { occurrenceId } = await s.auto.execute({ organizationId, invoiceId: "inv-agua" });
    s.invoiceRead.remove(organizationId, "inv-residuos");
    await s.release.execute({ organizationId, invoiceId: "inv-residuos", paymentGroupId: GROUP });
    const occ = await s.occurrenceRepo.findById(organizationId, occurrenceId!);
    expect(occ).toMatchObject({ invoiceId: "inv-agua", realAmountCents: 5998 });
  });
});

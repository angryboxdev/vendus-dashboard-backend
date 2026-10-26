import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { GenerateOccurrenceUseCase } from "../../application/use-cases/generate-occurrence.use-case.js";
import { LinkInvoiceToOccurrenceUseCase } from "../../application/use-cases/link-invoice-to-occurrence.use-case.js";
import { LinkInvoiceToRecurrenceUseCase } from "../../application/use-cases/link-invoice-to-recurrence.use-case.js";
import { AutoLinkInvoiceUseCase } from "../../application/use-cases/auto-link-invoice.use-case.js";
import { GetInvoiceRecurrenceStatusUseCase } from "../../application/use-cases/get-invoice-recurrence-status.use-case.js";
import { UnlinkInvoiceFromOccurrenceUseCase } from "../../application/use-cases/unlink-invoice-from-occurrence.use-case.js";
import { ReleaseInvoiceLinksUseCase } from "../../application/use-cases/release-invoice-links.use-case.js";
import { MarkOccurrenceAsPaidUseCase } from "../../application/use-cases/mark-occurrence-as-paid.use-case.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";
import { FakeOccurrenceRepository } from "../fakes/fake-occurrence-repository.js";
import { FakeInvoiceRead } from "../fakes/fake-invoice-read.js";
import { FakeEmployeeDirectoryRead } from "../fakes/fake-employee-directory-read.js";
import { OccurrenceInvalidTransitionError } from "../../domain/errors.js";

const organizationId = mintOrganizationId("org-a");
const otherOrganizationId = mintOrganizationId("org-b");

// Dados fictícios.
const BASE_REC = {
  organizationId,
  name: "Energia",
  supplierId: "sup-luz",
  supplierName: "Energia Exemplo Lda",
  type: "variable_invoice" as const,
  estimatedAmountCents: 20000,
  dayOfMonth: 20,
  startDate: "2026-01-01",
  paymentMethod: "direct_debit" as const,
};

const BASE_INV = {
  id: "inv-1",
  supplierId: "sup-luz",
  supplierName: "Energia Exemplo Lda",
  invoiceDate: "2026-10-05",
  totalWithVatCents: 21000,
  dueDate: "2026-10-25",
  status: "pending",
  paidAt: null,
};

function make() {
  const recurrenceRepo = new FakeRecurrenceRepository();
  const occurrenceRepo = new FakeOccurrenceRepository();
  const invoiceRead = new FakeInvoiceRead();
  const linkOcc = new LinkInvoiceToOccurrenceUseCase(occurrenceRepo, invoiceRead);
  const linkRec = new LinkInvoiceToRecurrenceUseCase(recurrenceRepo, occurrenceRepo, linkOcc);
  return {
    recurrenceRepo,
    occurrenceRepo,
    invoiceRead,
    create: new CreateRecurrenceUseCase(recurrenceRepo, new FakeEmployeeDirectoryRead()),
    generate: new GenerateOccurrenceUseCase(recurrenceRepo, occurrenceRepo),
    pay: new MarkOccurrenceAsPaidUseCase(occurrenceRepo),
    linkRec,
    auto: new AutoLinkInvoiceUseCase(recurrenceRepo, occurrenceRepo, invoiceRead, linkRec),
    status: new GetInvoiceRecurrenceStatusUseCase(recurrenceRepo, occurrenceRepo, invoiceRead),
    unlink: new UnlinkInvoiceFromOccurrenceUseCase(occurrenceRepo),
    release: new ReleaseInvoiceLinksUseCase(occurrenceRepo, invoiceRead),
  };
}

describe("Associação automática fatura → recorrência", () => {
  it("um único candidato: associa à ocorrência do mês da emissão e o previsto passa a real", async () => {
    const s = make();
    const rec = await s.create.execute(BASE_REC);
    s.invoiceRead.seed(organizationId, BASE_INV);

    const result = await s.auto.execute({ organizationId, invoiceId: "inv-1" });

    expect(result.outcome).toBe("linked");
    const occ = await s.occurrenceRepo.findByRecurrenceAndPeriod(organizationId, rec.id, "2026-10");
    expect(occ?.invoiceId).toBe("inv-1");
    expect(occ?.realAmountCents).toBe(21000);
    expect(occ?.status).toBe("invoice_linked");
  });

  it("se o mês da emissão já tem fatura, usa o mês anterior em aberto", async () => {
    const s = make();
    const rec = await s.create.execute(BASE_REC);
    await s.generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 10 });
    s.invoiceRead.seed(organizationId, { ...BASE_INV, id: "inv-out" });
    await s.auto.execute({ organizationId, invoiceId: "inv-out" }); // ocupa outubro

    s.invoiceRead.seed(organizationId, { ...BASE_INV, id: "inv-set" });
    const result = await s.auto.execute({ organizationId, invoiceId: "inv-set" });

    expect(result.outcome).toBe("linked");
    const set = await s.occurrenceRepo.findByRecurrenceAndPeriod(organizationId, rec.id, "2026-09");
    expect(set?.invoiceId).toBe("inv-set");
  });

  it("vários candidatos: não associa e devolve as sugestões", async () => {
    const s = make();
    await s.create.execute(BASE_REC);
    await s.create.execute({ ...BASE_REC, name: "Energia armazém" });
    s.invoiceRead.seed(organizationId, BASE_INV);

    const result = await s.auto.execute({ organizationId, invoiceId: "inv-1" });
    expect(result).toEqual({ outcome: "suggested", occurrenceId: null, candidateCount: 2 });

    const status = await s.status.execute({ organizationId, invoiceId: "inv-1" });
    expect(status.linked).toBeNull();
    expect(status.candidates.map((c) => [c.recurrenceName, c.period, c.deviationPercent])).toEqual([
      ["Energia", "2026-10", 5],
      ["Energia armazém", "2026-10", 5],
    ]);
  });

  it("a sub-categoria da fatura desempata e associa", async () => {
    const s = make();
    await s.create.execute({ ...BASE_REC, costCenterCategoryId: "c-luz" });
    const gas = await s.create.execute({ ...BASE_REC, name: "Gás", costCenterCategoryId: "c-gas" });
    s.invoiceRead.seed(organizationId, { ...BASE_INV, costCenterCategoryId: "c-gas" });

    const result = await s.auto.execute({ organizationId, invoiceId: "inv-1" });
    expect(result.outcome).toBe("linked");
    const occ = await s.occurrenceRepo.findByRecurrenceAndPeriod(organizationId, gas.id, "2026-10");
    expect(occ?.invoiceId).toBe("inv-1");
  });

  it("ignora notas de crédito, rascunhos da IA, faturas sem fornecedor e outras organizações", async () => {
    const s = make();
    await s.create.execute(BASE_REC);
    s.invoiceRead.seed(organizationId, { ...BASE_INV, id: "nc", documentType: "credit_note" });
    s.invoiceRead.seed(organizationId, { ...BASE_INV, id: "draft", status: "draft_ai" });
    s.invoiceRead.seed(organizationId, { ...BASE_INV, id: "nosup", supplierId: null });
    s.invoiceRead.seed(otherOrganizationId, { ...BASE_INV, id: "other" });

    for (const id of ["nc", "draft", "nosup"]) {
      expect((await s.auto.execute({ organizationId, invoiceId: id })).outcome).toBe("none");
    }
    expect((await s.auto.execute({ organizationId: otherOrganizationId, invoiceId: "other" })).outcome).toBe("none");
  });

  it("fatura já associada não volta a ser associada", async () => {
    const s = make();
    await s.create.execute(BASE_REC);
    s.invoiceRead.seed(organizationId, BASE_INV);
    await s.auto.execute({ organizationId, invoiceId: "inv-1" });
    expect((await s.auto.execute({ organizationId, invoiceId: "inv-1" })).outcome).toBe("already_linked");
  });

  it("não associa a ocorrências pagas", async () => {
    const s = make();
    const rec = await s.create.execute({ ...BASE_REC, type: "fixed_contract" });
    for (const month of [9, 10]) {
      const occ = await s.generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month });
      await s.pay.execute({ organizationId, occurrenceId: occ.id, paidAt: `2026-${String(month).padStart(2, "0")}-20` });
    }
    s.invoiceRead.seed(organizationId, BASE_INV);
    expect((await s.auto.execute({ organizationId, invoiceId: "inv-1" })).outcome).toBe("none");
  });
});

describe("Associar à mão, desassociar e fatura apagada", () => {
  it("associar escolhendo a recorrência gera a ocorrência do mês se faltar", async () => {
    const s = make();
    const rec = await s.create.execute(BASE_REC);
    s.invoiceRead.seed(organizationId, BASE_INV);
    const occ = await s.linkRec.execute({ organizationId, invoiceId: "inv-1", recurrenceId: rec.id, period: "2026-10" });
    expect(occ.invoiceId).toBe("inv-1");
    expect(occ.realAmountCents).toBe(21000);

    const status = await s.status.execute({ organizationId, invoiceId: "inv-1" });
    expect(status.linked?.recurrenceName).toBe("Energia");
    expect(status.candidates).toEqual([]);
  });

  it("desassociar volta ao previsto; não se desassocia o que não tem fatura", async () => {
    const s = make();
    await s.create.execute(BASE_REC);
    s.invoiceRead.seed(organizationId, BASE_INV);
    const { occurrenceId } = await s.auto.execute({ organizationId, invoiceId: "inv-1" });

    const back = await s.unlink.execute({ organizationId, occurrenceId: occurrenceId! });
    expect(back.invoiceId).toBeNull();
    expect(back.realAmountCents).toBeNull();
    expect(back.status).toBe("awaiting_invoice");
    await expect(s.unlink.execute({ organizationId, occurrenceId: occurrenceId! })).rejects.toThrow(OccurrenceInvalidTransitionError);
  });

  it("fatura apagada liberta as ocorrências não pagas", async () => {
    const s = make();
    await s.create.execute(BASE_REC);
    s.invoiceRead.seed(organizationId, BASE_INV);
    const { occurrenceId } = await s.auto.execute({ organizationId, invoiceId: "inv-1" });

    await s.release.execute({ organizationId, invoiceId: "inv-1", paymentGroupId: null });
    const occ = await s.occurrenceRepo.findById(organizationId, occurrenceId!);
    expect(occ?.invoiceId).toBeNull();
    expect(occ?.realAmountCents).toBeNull();
  });

  it("aviso de desvio quando o real se afasta ≥ 20 % do previsto", async () => {
    const s = make();
    await s.create.execute(BASE_REC);
    s.invoiceRead.seed(organizationId, { ...BASE_INV, totalWithVatCents: 26000 });
    await s.auto.execute({ organizationId, invoiceId: "inv-1" });
    const { linked } = await s.status.execute({ organizationId, invoiceId: "inv-1" });
    expect(linked?.occurrence.invoiceDeviationPercent).toBe(30);
    expect(linked?.occurrence.invoiceDeviationWarning).toBe(true);
  });
});

describe("Sem o mesmo fornecedor — categoria + nome só sugere", () => {
  it("recorrência «Energia» sem fornecedor, mesma sub-categoria: sugere, não associa sozinho", async () => {
    const s = make();
    await s.create.execute({ ...BASE_REC, supplierId: null, supplierName: "Energia loja", costCenterId: "g-util", costCenterCategoryId: "c-luz" });
    s.invoiceRead.seed(organizationId, { ...BASE_INV, supplierId: "sup-novo", supplierName: "Energia Exemplo Lda", costCenterGroupId: "g-util", costCenterCategoryId: "c-luz" });

    const result = await s.auto.execute({ organizationId, invoiceId: "inv-1" });
    expect(result).toEqual({ outcome: "suggested", occurrenceId: null, candidateCount: 1 });

    const status = await s.status.execute({ organizationId, invoiceId: "inv-1" });
    expect(status.candidates.map((c) => [c.recurrenceName, c.matchedBy, c.period])).toEqual([["Energia", "category_name", "2026-10"]]);
  });

  it("pelo fornecedor continua a associar sozinho", async () => {
    const s = make();
    await s.create.execute(BASE_REC);
    s.invoiceRead.seed(organizationId, BASE_INV);
    const status0 = await s.status.execute({ organizationId, invoiceId: "inv-1" });
    expect(status0.candidates[0]?.matchedBy).toBe("supplier");
    expect((await s.auto.execute({ organizationId, invoiceId: "inv-1" })).outcome).toBe("linked");
  });
});

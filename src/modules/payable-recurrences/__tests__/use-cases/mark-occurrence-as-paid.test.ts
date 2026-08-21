import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { GenerateOccurrenceUseCase } from "../../application/use-cases/generate-occurrence.use-case.js";
import { LinkInvoiceToOccurrenceUseCase } from "../../application/use-cases/link-invoice-to-occurrence.use-case.js";
import { MarkOccurrenceAsPaidUseCase } from "../../application/use-cases/mark-occurrence-as-paid.use-case.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";
import { FakeOccurrenceRepository } from "../fakes/fake-occurrence-repository.js";
import { FakeInvoiceRead } from "../fakes/fake-invoice-read.js";
import {
  OccurrenceNotFoundError,
  OccurrenceInvoiceRequiredError,
  OccurrenceInvalidTransitionError,
} from "../../domain/errors.js";

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
    markPaid: new MarkOccurrenceAsPaidUseCase(occurrenceRepo),
  };
}

const FIXED_CMD = {
  name: "Internet NOS",
  supplierName: "NOS",
  type: "fixed_contract" as const,
  estimatedAmountCents: 4500,
  dayOfMonth: 15,
  startDate: "2026-01-01",
  paymentMethod: "direct_debit" as const,
};

const VARIABLE_CMD = {
  name: "Energia - Gold Energy",
  supplierName: "Gold Energy",
  type: "variable_invoice" as const,
  estimatedAmountCents: 26175,
  dayOfMonth: 20,
  startDate: "2026-01-01",
  paymentMethod: "transfer" as const,
  requireInvoice: true,
};

describe("MarkOccurrenceAsPaidUseCase", () => {
  it("marca ocorrência forecast como paid diretamente (sem fatura obrigatória)", async () => {
    const { create, generate, markPaid } = make();

    const rec = await create.execute(FIXED_CMD);
    const occ = await generate.execute({ recurrenceId: rec.id, year: 2026, month: 9 });
    expect(occ.status).toBe("forecast");

    const result = await markPaid.execute({
      occurrenceId: occ.id,
      paidAt: "2026-09-15",
      paymentMethod: "transfer",
    });

    expect(result.status).toBe("paid");
    expect(result.paidAt).not.toBeNull();
    expect(result.paymentMethod).toBe("transfer");
  });

  it("marca ocorrência invoice_linked como paid quando requireInvoice=true", async () => {
    const { create, generate, link, markPaid, invoiceRead } = make();

    const rec = await create.execute(VARIABLE_CMD);
    const occ = await generate.execute({ recurrenceId: rec.id, year: 2026, month: 9 });
    expect(occ.status).toBe("awaiting_invoice");

    invoiceRead.seed({
      id: "inv-1",
      supplierId: null,
      supplierName: "Gold Energy",
      totalWithVatCents: 31050,
      dueDate: "2026-09-25",
    });
    await link.execute({ occurrenceId: occ.id, invoiceId: "inv-1" });

    const result = await markPaid.execute({ occurrenceId: occ.id });

    expect(result.status).toBe("paid");
    expect(result.invoiceId).toBe("inv-1");
  });

  it("lança OccurrenceInvoiceRequiredError se requireInvoice=true e fatura não vinculada", async () => {
    const { create, generate, markPaid } = make();

    const rec = await create.execute(VARIABLE_CMD);
    const occ = await generate.execute({ recurrenceId: rec.id, year: 2026, month: 9 });
    expect(occ.status).toBe("awaiting_invoice");

    await expect(markPaid.execute({ occurrenceId: occ.id })).rejects.toThrow(
      OccurrenceInvoiceRequiredError,
    );
  });

  it("lança OccurrenceInvalidTransitionError se já está paid", async () => {
    const { create, generate, markPaid } = make();

    const rec = await create.execute(FIXED_CMD);
    const occ = await generate.execute({ recurrenceId: rec.id, year: 2026, month: 9 });
    await markPaid.execute({ occurrenceId: occ.id });

    await expect(markPaid.execute({ occurrenceId: occ.id })).rejects.toThrow(
      OccurrenceInvalidTransitionError,
    );
  });

  it("lança OccurrenceNotFoundError para id inexistente", async () => {
    const { markPaid } = make();
    await expect(markPaid.execute({ occurrenceId: "nao-existe" })).rejects.toThrow(
      OccurrenceNotFoundError,
    );
  });

  it("usa data atual se paidAt não for fornecido", async () => {
    const { create, generate, markPaid } = make();

    const rec = await create.execute(FIXED_CMD);
    const occ = await generate.execute({ recurrenceId: rec.id, year: 2026, month: 9 });
    const before = new Date();
    const result = await markPaid.execute({ occurrenceId: occ.id });
    const after = new Date();

    const paidDate = new Date(result.paidAt!);
    expect(paidDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(paidDate.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

import { describe, it, expect } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { GenerateOccurrenceUseCase } from "../../application/use-cases/generate-occurrence.use-case.js";
import { LinkInvoiceToOccurrenceUseCase } from "../../application/use-cases/link-invoice-to-occurrence.use-case.js";
import { ListOccurrencesUseCase } from "../../application/use-cases/list-occurrences.use-case.js";
import { GetOccurrenceUseCase } from "../../application/use-cases/get-occurrence.use-case.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";
import { FakeOccurrenceRepository } from "../fakes/fake-occurrence-repository.js";
import { FakeBankMovementLinkReadAdapter } from "../fakes/fake-bank-movement-link-read.js";
import { FakeInvoiceAllocatedAmountReadAdapter } from "../fakes/fake-invoice-allocated-amount-read.js";
import { FakeInvoiceRead } from "../fakes/fake-invoice-read.js";

const organizationId = mintOrganizationId("org-a");

const BASE_CMD = {
  organizationId,
  name: "Renda",
  supplierName: "Proprietário Lda",
  type: "fixed_contract" as const,
  estimatedAmountCents: 100_000,
  dayOfMonth: 5,
  startDate: "2026-01-01",
  paymentMethod: "transfer" as const,
};

const VARIABLE_CMD = {
  organizationId,
  name: "Energia - Gold Energy",
  supplierName: "Gold Energy",
  type: "variable_invoice" as const,
  estimatedAmountCents: 25_000,
  dayOfMonth: 20,
  startDate: "2026-01-01",
  paymentMethod: "transfer" as const,
};

const BANK_LINK = {
  id: "mov-1",
  bookingDate: "2026-08-05",
  amountCents: 37_587,
  description: "TRF P/ Dream Plus",
};

function make() {
  const recurrenceRepo = new FakeRecurrenceRepository();
  const occurrenceRepo = new FakeOccurrenceRepository();
  const bankLinkRead = new FakeBankMovementLinkReadAdapter();
  const invoiceAllocatedAmountRead = new FakeInvoiceAllocatedAmountReadAdapter();
  const invoiceRead = new FakeInvoiceRead();
  return {
    recurrenceRepo,
    occurrenceRepo,
    bankLinkRead,
    invoiceAllocatedAmountRead,
    invoiceRead,
    create: new CreateRecurrenceUseCase(recurrenceRepo),
    generate: new GenerateOccurrenceUseCase(recurrenceRepo, occurrenceRepo),
    linkInvoice: new LinkInvoiceToOccurrenceUseCase(occurrenceRepo, invoiceRead),
    list: new ListOccurrencesUseCase(occurrenceRepo, bankLinkRead, invoiceAllocatedAmountRead),
    get: new GetOccurrenceUseCase(occurrenceRepo, bankLinkRead, invoiceAllocatedAmountRead),
  };
}

describe("OccurrenceDTO — linkedBankMovements / paidAmountCents / displayState", () => {
  describe("fluxo B (sem fatura) — ListOccurrencesUseCase", () => {
    it("linkedBankMovements é [] e paidAmountCents é 0 quando não há movimento vinculado", async () => {
      const { create, generate, list } = make();
      const rec = await create.execute(BASE_CMD);
      // vencimento no futuro — não pode cair em "overdue"
      await generate.execute({ organizationId, recurrenceId: rec.id, year: 2027, month: 1 });

      const [dto] = await list.execute({ organizationId, recurrenceId: rec.id });
      expect(dto!.linkedBankMovements).toEqual([]);
      expect(dto!.paidAmountCents).toBe(0);
      expect(dto!.displayState).toBe("awaiting_payment");
    });

    it("um único movimento cobrindo o total → paidAmountCents = valor do movimento, estado 'paid'", async () => {
      const { create, generate, list, bankLinkRead } = make();
      const rec = await create.execute(BASE_CMD); // estimatedAmountCents: 100_000
      const occ = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 8 });

      bankLinkRead.seedLink(organizationId, occ.id, { ...BANK_LINK, amountCents: 100_000 });

      const [dto] = await list.execute({ organizationId, recurrenceId: rec.id });
      expect(dto!.linkedBankMovements).toEqual([{ ...BANK_LINK, amountCents: 100_000 }]);
      expect(dto!.paidAmountCents).toBe(100_000);
      expect(dto!.differenceCents).toBe(0);
      expect(dto!.displayState).toBe("paid");
    });

    it("pagamento parcial (dois movimentos, soma abaixo do previsto) → 'partially_paid'", async () => {
      const { create, generate, list, bankLinkRead } = make();
      const rec = await create.execute(BASE_CMD); // estimatedAmountCents: 100_000
      const occ = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 8 });

      bankLinkRead.seedLink(organizationId, occ.id, { ...BANK_LINK, id: "mov-1", amountCents: 60_000 });
      bankLinkRead.seedLink(organizationId, occ.id, { ...BANK_LINK, id: "mov-2", amountCents: 30_000 });

      const [dto] = await list.execute({ organizationId, recurrenceId: rec.id });
      expect(dto!.linkedBankMovements).toHaveLength(2);
      expect(dto!.paidAmountCents).toBe(90_000);
      expect(dto!.differenceCents).toBe(-10_000);
      expect(dto!.displayState).toBe("partially_paid");
    });

    it("dois movimentos cuja soma cobre o total (com tolerância) → 'paid'", async () => {
      const { create, generate, list, bankLinkRead } = make();
      const rec = await create.execute(BASE_CMD); // estimatedAmountCents: 100_000
      const occ = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 8 });

      bankLinkRead.seedLink(organizationId, occ.id, { ...BANK_LINK, id: "mov-1", amountCents: 60_000 });
      bankLinkRead.seedLink(organizationId, occ.id, { ...BANK_LINK, id: "mov-2", amountCents: 40_000 });

      const [dto] = await list.execute({ organizationId, recurrenceId: rec.id });
      expect(dto!.paidAmountCents).toBe(100_000);
      expect(dto!.displayState).toBe("paid");
    });

    it("enriquece apenas as ocorrências que têm link — as restantes ficam com paidAmountCents=0", async () => {
      const { create, generate, list, bankLinkRead } = make();
      const rec = await create.execute(BASE_CMD);
      const occ1 = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 7 });
      const occ2 = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 8 });

      bankLinkRead.seedLink(organizationId, occ1.id, BANK_LINK);

      const dtos = await list.execute({ organizationId, recurrenceId: rec.id });
      const dto1 = dtos.find((d) => d.id === occ1.id)!;
      const dto2 = dtos.find((d) => d.id === occ2.id)!;

      expect(dto1.linkedBankMovements).toEqual([BANK_LINK]);
      expect(dto2.linkedBankMovements).toEqual([]);
      expect(dto2.paidAmountCents).toBe(0);
    });

    it("retorna lista vazia sem chamar os ports desnecessariamente", async () => {
      const { list } = make();
      const result = await list.execute({ organizationId });
      expect(result).toHaveLength(0);
    });

    it("vencimento no passado sem pagamento → 'overdue'", async () => {
      const { create, generate, list } = make();
      const rec = await create.execute({ ...BASE_CMD, dayOfMonth: 5 });
      // Fevereiro/2026: depois do startDate (2026-01-01) da recorrência, mas
      // já no passado face ao "hoje" real do sistema.
      const occ = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 2 });
      expect(occ.dueDate).toBe("2026-02-05");

      const [dto] = await list.execute({ organizationId, recurrenceId: rec.id });
      expect(dto!.displayState).toBe("overdue");
    });
  });

  describe("fluxo A (com fatura) — GetOccurrenceUseCase", () => {
    it("Pago vem do valor alocado à fatura no banco, não do movimento diretamente ligado à ocorrência", async () => {
      const { create, generate, linkInvoice, get, invoiceRead, invoiceAllocatedAmountRead, bankLinkRead } = make();
      const rec = await create.execute(VARIABLE_CMD);
      const occ = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 9 });

      invoiceRead.seed(organizationId, {
        id: "inv-1",
        supplierId: null,
        supplierName: "Gold Energy",
        totalWithVatCents: 25_000,
        dueDate: null,
        status: "pending",
        paidAt: null,
      });
      const linked = await linkInvoice.execute({ organizationId, occurrenceId: occ.id, invoiceId: "inv-1" });

      // Mesmo com um bank_movements.matched_entity_id apontando (erradamente)
      // para a ocorrência, o fluxo A ignora-o — só conta o alocado à fatura.
      bankLinkRead.seedLink(organizationId, occ.id, BANK_LINK);
      invoiceAllocatedAmountRead.seedAllocatedAmount(organizationId, "inv-1", 25_000);

      const dto = await get.execute({ organizationId, id: linked.id });
      expect(dto.linkedBankMovements).toEqual([]);
      expect(dto.paidAmountCents).toBe(25_000);
      expect(dto.displayState).toBe("paid");
    });

    it("fatura parcialmente reconciliada no banco → 'partially_paid'", async () => {
      const { create, generate, linkInvoice, get, invoiceRead, invoiceAllocatedAmountRead } = make();
      const rec = await create.execute(VARIABLE_CMD);
      const occ = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 9 });

      invoiceRead.seed(organizationId, {
        id: "inv-1",
        supplierId: null,
        supplierName: "Gold Energy",
        totalWithVatCents: 25_000,
        dueDate: null,
        status: "pending",
        paidAt: null,
      });
      const linked = await linkInvoice.execute({ organizationId, occurrenceId: occ.id, invoiceId: "inv-1" });
      invoiceAllocatedAmountRead.seedAllocatedAmount(organizationId, "inv-1", 10_000);

      const dto = await get.execute({ organizationId, id: linked.id });
      expect(dto.paidAmountCents).toBe(10_000);
      expect(dto.displayState).toBe("partially_paid");
    });

    it("fatura ainda sem nenhuma alocação bancária → paidAmountCents 0", async () => {
      const { create, generate, linkInvoice, get, invoiceRead } = make();
      const rec = await create.execute(VARIABLE_CMD);
      // vencimento no futuro — não pode cair em "overdue"
      const occ = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2027, month: 1 });

      invoiceRead.seed(organizationId, {
        id: "inv-1",
        supplierId: null,
        supplierName: "Gold Energy",
        totalWithVatCents: 25_000,
        dueDate: null,
        status: "pending",
        paidAt: null,
      });
      const linked = await linkInvoice.execute({ organizationId, occurrenceId: occ.id, invoiceId: "inv-1" });

      const dto = await get.execute({ organizationId, id: linked.id });
      expect(dto.paidAmountCents).toBe(0);
      expect(dto.displayState).toBe("awaiting_payment");
    });
  });
});

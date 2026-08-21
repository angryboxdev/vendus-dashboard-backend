import { describe, it, expect, beforeEach } from "@jest/globals";
import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { GenerateOccurrenceUseCase } from "../../application/use-cases/generate-occurrence.use-case.js";
import { ListOccurrencesUseCase } from "../../application/use-cases/list-occurrences.use-case.js";
import { GetOccurrenceUseCase } from "../../application/use-cases/get-occurrence.use-case.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";
import { FakeOccurrenceRepository } from "../fakes/fake-occurrence-repository.js";
import { FakeBankMovementLinkReadAdapter } from "../fakes/fake-bank-movement-link-read.js";

const BASE_CMD = {
  name: "Renda",
  supplierName: "Proprietário Lda",
  type: "fixed_contract" as const,
  estimatedAmountCents: 100_000,
  dayOfMonth: 5,
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
  return {
    recurrenceRepo,
    occurrenceRepo,
    bankLinkRead,
    create: new CreateRecurrenceUseCase(recurrenceRepo),
    generate: new GenerateOccurrenceUseCase(recurrenceRepo, occurrenceRepo),
    list: new ListOccurrencesUseCase(occurrenceRepo, bankLinkRead),
    get: new GetOccurrenceUseCase(occurrenceRepo, bankLinkRead),
  };
}

describe("OccurrenceDTO — linkedBankMovement", () => {
  describe("ListOccurrencesUseCase", () => {
    it("linkedBankMovement é null quando não há movimento bancário vinculado", async () => {
      const { create, generate, list } = make();
      const rec = await create.execute(BASE_CMD);
      await generate.execute({ recurrenceId: rec.id, year: 2026, month: 8 });

      const [dto] = await list.execute({ recurrenceId: rec.id });
      expect(dto!.linkedBankMovement).toBeNull();
    });

    it("linkedBankMovement é preenchido quando o movimento existe", async () => {
      const { create, generate, list, bankLinkRead } = make();
      const rec = await create.execute(BASE_CMD);
      const occ = await generate.execute({ recurrenceId: rec.id, year: 2026, month: 8 });

      bankLinkRead.seedLink(occ.id, BANK_LINK);

      const [dto] = await list.execute({ recurrenceId: rec.id });
      expect(dto!.linkedBankMovement).toEqual(BANK_LINK);
    });

    it("enriquece apenas as ocorrências que têm link — as restantes ficam null", async () => {
      const { create, generate, list, bankLinkRead } = make();
      const rec = await create.execute(BASE_CMD);
      const occ1 = await generate.execute({ recurrenceId: rec.id, year: 2026, month: 7 });
      const occ2 = await generate.execute({ recurrenceId: rec.id, year: 2026, month: 8 });

      bankLinkRead.seedLink(occ1.id, BANK_LINK);

      const dtos = await list.execute({ recurrenceId: rec.id });
      const dto1 = dtos.find((d) => d.id === occ1.id)!;
      const dto2 = dtos.find((d) => d.id === occ2.id)!;

      expect(dto1.linkedBankMovement).toEqual(BANK_LINK);
      expect(dto2.linkedBankMovement).toBeNull();
    });

    it("retorna lista vazia sem chamar o port desnecessariamente", async () => {
      const { list } = make();
      const result = await list.execute({});
      expect(result).toHaveLength(0);
    });
  });

  describe("GetOccurrenceUseCase", () => {
    it("linkedBankMovement é null quando não há link", async () => {
      const { create, generate, get } = make();
      const rec = await create.execute(BASE_CMD);
      const occ = await generate.execute({ recurrenceId: rec.id, year: 2026, month: 8 });

      const dto = await get.execute(occ.id);
      expect(dto.linkedBankMovement).toBeNull();
    });

    it("linkedBankMovement é preenchido com dados do movimento bancário", async () => {
      const { create, generate, get, bankLinkRead } = make();
      const rec = await create.execute(BASE_CMD);
      const occ = await generate.execute({ recurrenceId: rec.id, year: 2026, month: 8 });

      bankLinkRead.seedLink(occ.id, BANK_LINK);

      const dto = await get.execute(occ.id);
      expect(dto.linkedBankMovement).not.toBeNull();
      expect(dto.linkedBankMovement!.id).toBe("mov-1");
      expect(dto.linkedBankMovement!.bookingDate).toBe("2026-08-05");
      expect(dto.linkedBankMovement!.amountCents).toBe(37_587);
      expect(dto.linkedBankMovement!.description).toBe("TRF P/ Dream Plus");
    });
  });
});

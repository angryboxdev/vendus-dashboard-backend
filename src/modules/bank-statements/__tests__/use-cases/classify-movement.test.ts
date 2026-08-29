import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ClassifyMovementUseCase } from "../../application/use-cases/classify-movement.use-case.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { MovementNotFoundError } from "../../domain/errors.js";

function makeMovement(id?: string) {
  const m = BankMovement.create({
    statementImportId: "s1",
    bookingDate: new Date("2026-07-01T00:00:00.000Z"),
    valueDate: new Date("2026-07-01T00:00:00.000Z"),
    description: "COM.MAN.CONTA",
    amount: 500,
    balanceAfter: 149_500,
    movementType: "debit",
    deduplicationHash: id ?? "hash-1",
  });
  // Reconstitute with known id for testing
  if (id) {
    return BankMovement.reconstitute({
      ...Object.assign({}, m),
      id,
    } as Parameters<typeof BankMovement.reconstitute>[0]);
  }
  return m;
}

describe("ClassifyMovementUseCase", () => {
  const organizationId = mintOrganizationId("org-a");
  let repo: FakeBankMovementRepository;
  let useCase: ClassifyMovementUseCase;
  let movement: BankMovement;

  beforeEach(async () => {
    repo = new FakeBankMovementRepository();
    useCase = new ClassifyMovementUseCase(repo);
    movement = BankMovement.create({
      statementImportId: "s1",
      bookingDate: new Date("2026-07-01T00:00:00.000Z"),
      valueDate: new Date("2026-07-01T00:00:00.000Z"),
      description: "COM.MAN.CONTA",
      amount: 500,
      balanceAfter: 149_500,
      movementType: "debit",
      deduplicationHash: "hash-1",
    });
    await repo.saveBulk(organizationId, [movement]);
  });

  it("throws MovementNotFoundError for unknown id", async () => {
    await expect(
      useCase.execute({
        organizationId,
        movementId: "not-found",
        justificationType: "despesa_bancaria_automatica",
      })
    ).rejects.toThrow(MovementNotFoundError);
  });

  it("classifies movement as bank fee → justificado", async () => {
    await useCase.execute({
      organizationId,
      movementId: movement.id,
      justificationType: "despesa_bancaria_automatica",
    });
    const updated = await repo.findById(organizationId, movement.id);
    expect(updated?.reconciliationStatus).toBe("justificado");
    expect(updated?.isResolved).toBe(true);
  });

  it("classifies movement as contrato_recorrencia → justificado with matched occurrence", async () => {
    await useCase.execute({
      organizationId,
      movementId: movement.id,
      justificationType: "contrato_recorrencia",
      matchedEntityType: "recurrence_occurrence",
      matchedEntityId: "occ-aug-2026",
    });
    const updated = await repo.findById(organizationId, movement.id);
    expect(updated?.reconciliationStatus).toBe("justificado");
    expect(updated?.matchedEntityType).toBe("recurrence_occurrence");
    expect(updated?.matchedEntityId).toBe("occ-aug-2026");
    expect(updated?.isResolved).toBe(true);
  });

  it("classifies movement as internal transfer with notes", async () => {
    await useCase.execute({
      organizationId,
      movementId: movement.id,
      justificationType: "transferencia_interna",
      notes: "Conta poupança para conta corrente",
    });
    const updated = await repo.findById(organizationId, movement.id);
    expect(updated?.reconciliationStatus).toBe("transferencia_interna");
    expect(updated?.notes).toBe("Conta poupança para conta corrente");
  });

  it("persists costCenterGroupId and costCenterCategoryId", async () => {
    await useCase.execute({
      organizationId,
      movementId: movement.id,
      justificationType: "despesa_bancaria_automatica",
      costCenterGroupId: "grp-cap",
      costCenterCategoryId: "cat-bancaria",
    });
    const updated = await repo.findById(organizationId, movement.id);
    expect(updated?.costCenterGroupId).toBe("grp-cap");
    expect(updated?.costCenterCategoryId).toBe("cat-bancaria");
  });

  it("persists supplierId", async () => {
    await useCase.execute({
      organizationId,
      movementId: movement.id,
      justificationType: "recibo_comprovativo",
      supplierId: "sup-edp",
    });
    const updated = await repo.findById(organizationId, movement.id);
    expect(updated?.supplierId).toBe("sup-edp");
  });

  it("persists vatRate and vatIncluded", async () => {
    await useCase.execute({
      organizationId,
      movementId: movement.id,
      justificationType: "recibo_comprovativo",
      vatRate: 23,
      vatIncluded: false,
    });
    const updated = await repo.findById(organizationId, movement.id);
    expect(updated?.vatRate).toBe(23);
    expect(updated?.vatIncluded).toBe(false);
  });

  it("persists documentUrl", async () => {
    await useCase.execute({
      organizationId,
      movementId: movement.id,
      justificationType: "recibo_comprovativo",
      documentUrl: "https://storage.example.com/doc.pdf",
    });
    const updated = await repo.findById(organizationId, movement.id);
    expect(updated?.documentUrl).toBe("https://storage.example.com/doc.pdf");
  });
});

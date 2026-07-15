import { describe, it, expect, beforeEach } from "@jest/globals";
import { ReconcileMovementUseCase } from "../../application/use-cases/reconcile-movement.use-case.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { MovementNotFoundError } from "../../domain/errors.js";

function makeDebit(hash = "hash-1") {
  return BankMovement.create({
    statementImportId: "stmt-1",
    bookingDate: new Date("2026-07-05"),
    valueDate: new Date("2026-07-05"),
    description: "PAGAMENTO EDP",
    amount: 12_000,
    balanceAfter: 88_000,
    movementType: "debit",
    deduplicationHash: hash,
  });
}

describe("ReconcileMovementUseCase", () => {
  let repo: FakeBankMovementRepository;
  let useCase: ReconcileMovementUseCase;
  let movement: BankMovement;

  beforeEach(async () => {
    repo = new FakeBankMovementRepository();
    useCase = new ReconcileMovementUseCase(repo);
    movement = makeDebit();
    await repo.saveBulk([movement]);
  });

  it("throws MovementNotFoundError for unknown id", async () => {
    await expect(
      useCase.execute({ movementId: "not-found", entityType: "invoice", entityId: "inv-1" })
    ).rejects.toThrow(MovementNotFoundError);
  });

  it("links movement to an invoice → conciliado_com_fatura", async () => {
    await useCase.execute({
      movementId: movement.id,
      entityType: "invoice",
      entityId: "inv-42",
    });

    const updated = await repo.findById(movement.id);
    expect(updated!.reconciliationStatus).toBe("conciliado_com_fatura");
    expect(updated!.matchedEntityType).toBe("invoice");
    expect(updated!.matchedEntityId).toBe("inv-42");
    expect(updated!.isResolved).toBe(true);
  });

  it("links movement to a payable_entry → conciliado_com_fatura", async () => {
    await useCase.execute({
      movementId: movement.id,
      entityType: "payable_entry",
      entityId: "pe-7",
    });

    const updated = await repo.findById(movement.id);
    expect(updated!.reconciliationStatus).toBe("conciliado_com_fatura");
    expect(updated!.matchedEntityType).toBe("payable_entry");
    expect(updated!.matchedEntityId).toBe("pe-7");
  });

  it("persists change to repository", async () => {
    await useCase.execute({
      movementId: movement.id,
      entityType: "invoice",
      entityId: "inv-1",
    });

    const persisted = await repo.findById(movement.id);
    expect(persisted!.isResolved).toBe(true);
  });
});

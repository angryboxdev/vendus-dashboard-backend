import { describe, it, expect, beforeEach } from "@jest/globals";
import { ReconcileMovementUseCase } from "../../application/use-cases/reconcile-movement.use-case.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeMovementMatchHint } from "../fakes/fake-movement-match-hint.js";
import { MovementNotFoundError } from "../../domain/errors.js";

function makeDebit(hash = "hash-1") {
  return BankMovement.create({
    statementImportId: "stmt-1",
    bookingDate: new Date("2026-07-05"),
    valueDate: new Date("2026-07-05"),
    description: "PAGAMENTO GALP ENERGIA REF 12345",
    amount: 12_000,
    balanceAfter: 88_000,
    movementType: "debit",
    deduplicationHash: hash,
  });
}

describe("ReconcileMovementUseCase", () => {
  let repo: FakeBankMovementRepository;
  let hint: FakeMovementMatchHint;
  let useCase: ReconcileMovementUseCase;
  let movement: BankMovement;

  beforeEach(async () => {
    repo = new FakeBankMovementRepository();
    hint = new FakeMovementMatchHint();
    useCase = new ReconcileMovementUseCase(repo, hint);
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

  it("saves hint when supplierId is provided", async () => {
    await useCase.execute({
      movementId: movement.id,
      entityType: "invoice",
      entityId: "inv-1",
      supplierId: "sup-galp",
    });

    expect(hint.savedCalls).toHaveLength(1);
    expect(hint.savedCalls[0]!.supplierId).toBe("sup-galp");
    // normalized: "pagamento galp energia" (noise words removed, ref+numbers removed)
    expect(hint.savedCalls[0]!.normalizedDesc).toContain("galp");
    expect(hint.savedCalls[0]!.normalizedDesc).toContain("energia");
  });

  it("does not save hint when supplierId is absent", async () => {
    await useCase.execute({
      movementId: movement.id,
      entityType: "invoice",
      entityId: "inv-1",
    });

    expect(hint.savedCalls).toHaveLength(0);
  });

  it("does not save hint when description normalizes to empty string", async () => {
    const noiseMovement = BankMovement.create({
      statementImportId: "stmt-1",
      bookingDate: new Date("2026-07-05"),
      valueDate: new Date("2026-07-05"),
      description: "TRANSF CRED REF 20240715",
      amount: 5_000,
      balanceAfter: 83_000,
      movementType: "debit",
      deduplicationHash: "hash-noise",
    });
    await repo.saveBulk([noiseMovement]);

    await useCase.execute({
      movementId: noiseMovement.id,
      entityType: "invoice",
      entityId: "inv-2",
      supplierId: "sup-x",
    });

    expect(hint.savedCalls).toHaveLength(0);
  });
});

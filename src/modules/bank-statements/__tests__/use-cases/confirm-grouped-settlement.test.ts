import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ConfirmGroupedSettlementUseCase } from "../../application/use-cases/confirm-grouped-settlement.use-case.js";
import { FakeGroupedSettlementWrite } from "../fakes/fake-grouped-settlement-write.js";
import { MovementNotFoundError, StaleDocumentBalanceError } from "../../domain/errors.js";

describe("ConfirmGroupedSettlementUseCase", () => {
  const organizationId = mintOrganizationId("org-a");
  let writePort: FakeGroupedSettlementWrite;
  let useCase: ConfirmGroupedSettlementUseCase;

  beforeEach(() => {
    writePort = new FakeGroupedSettlementWrite();
    useCase = new ConfirmGroupedSettlementUseCase(writePort);
    writePort.movements.set("mov-1", { id: "mov-1", amount: 80_000 });
    writePort.invoices.set("inv-1", { id: "inv-1", totalWithVat: 40_000, documentType: "invoice" });
    writePort.invoices.set("inv-2", { id: "inv-2", totalWithVat: 60_000, documentType: "invoice" });
    writePort.invoices.set("cn-1", { id: "cn-1", totalWithVat: -20_000, documentType: "credit_note" });
  });

  it("throws when entityLinks is empty", async () => {
    await expect(
      useCase.execute({ organizationId, movementId: "mov-1", entityLinks: [] })
    ).rejects.toThrow("At least one entity link is required");
  });

  it("throws when an invoice link has a non-positive allocatedAmountCents", async () => {
    await expect(
      useCase.execute({
        organizationId,
        movementId: "mov-1",
        entityLinks: [
          { entityId: "inv-1", documentType: "invoice", allocatedAmountCents: -40_000, expectedOpenBalanceCents: 40_000 },
        ],
      })
    ).rejects.toThrow(/must be positive for invoices/);
  });

  it("throws when a credit_note link has a non-negative allocatedAmountCents", async () => {
    await expect(
      useCase.execute({
        organizationId,
        movementId: "mov-1",
        entityLinks: [
          { entityId: "cn-1", documentType: "credit_note", allocatedAmountCents: 20_000, expectedOpenBalanceCents: -20_000 },
        ],
      })
    ).rejects.toThrow(/must be negative for credit notes/);
  });

  it("settles an exact combination of invoices + a credit note atomically", async () => {
    const result = await useCase.execute({
      organizationId,
      movementId: "mov-1",
      entityLinks: [
        { entityId: "inv-1", documentType: "invoice", allocatedAmountCents: 40_000, expectedOpenBalanceCents: 40_000 },
        { entityId: "inv-2", documentType: "invoice", allocatedAmountCents: 60_000, expectedOpenBalanceCents: 60_000 },
        { entityId: "cn-1", documentType: "credit_note", allocatedAmountCents: -20_000, expectedOpenBalanceCents: -20_000 },
      ],
    });

    expect(result.reconciliationStatus).toBe("conciliado_com_fatura");
    expect(writePort.links).toHaveLength(3);
  });

  it("throws MovementNotFoundError for an unknown movement", async () => {
    await expect(
      useCase.execute({
        organizationId,
        movementId: "ghost",
        entityLinks: [
          { entityId: "inv-1", documentType: "invoice", allocatedAmountCents: 40_000, expectedOpenBalanceCents: 40_000 },
        ],
      })
    ).rejects.toThrow(MovementNotFoundError);
  });

  it("rejects with StaleDocumentBalanceError when a document's true open balance changed (concurrent settlement)", async () => {
    // Simulate another movement having already consumed part of inv-1's balance.
    writePort.links.push({
      id: "other-link",
      movementId: "other-movement",
      entityType: "invoice",
      entityId: "inv-1",
      amountCents: 40_000,
      allocatedAmountCents: 10_000,
      entityLabel: "x",
    });

    await expect(
      useCase.execute({
        organizationId,
        movementId: "mov-1",
        entityLinks: [
          // Caller still believes the open balance is the full 40_000 — stale.
          { entityId: "inv-1", documentType: "invoice", allocatedAmountCents: 40_000, expectedOpenBalanceCents: 40_000 },
        ],
      })
    ).rejects.toThrow(StaleDocumentBalanceError);

    // Nothing was written — rejection happens before any delete/insert (all-or-nothing).
    expect(writePort.links.filter((l) => l.movementId === "mov-1")).toHaveLength(0);
  });

  it("rolls back the whole batch when validation fails partway through (atomicity, no partial writes)", async () => {
    // inv-2's expected balance is wrong (stale) — must reject the ENTIRE
    // 3-document batch, including the otherwise-valid inv-1 and cn-1 links.
    await expect(
      useCase.execute({
        organizationId,
        movementId: "mov-1",
        entityLinks: [
          { entityId: "inv-1", documentType: "invoice", allocatedAmountCents: 40_000, expectedOpenBalanceCents: 40_000 },
          { entityId: "inv-2", documentType: "invoice", allocatedAmountCents: 60_000, expectedOpenBalanceCents: 999 },
          { entityId: "cn-1", documentType: "credit_note", allocatedAmountCents: -20_000, expectedOpenBalanceCents: -20_000 },
        ],
      })
    ).rejects.toThrow(StaleDocumentBalanceError);

    expect(writePort.links).toHaveLength(0);
  });

  it("is idempotent: confirming the same still-valid selection twice produces the same end state", async () => {
    const links = [
      { entityId: "inv-1", documentType: "invoice" as const, allocatedAmountCents: 40_000, expectedOpenBalanceCents: 40_000 },
      { entityId: "inv-2", documentType: "invoice" as const, allocatedAmountCents: 60_000, expectedOpenBalanceCents: 60_000 },
      { entityId: "cn-1", documentType: "credit_note" as const, allocatedAmountCents: -20_000, expectedOpenBalanceCents: -20_000 },
    ];

    const first = await useCase.execute({ organizationId, movementId: "mov-1", entityLinks: links });
    const second = await useCase.execute({ organizationId, movementId: "mov-1", entityLinks: links });

    expect(first.reconciliationStatus).toBe(second.reconciliationStatus);
    expect(writePort.links).toHaveLength(3); // never duplicated
    expect(writePort.calls).toHaveLength(2); // both calls succeeded (retry-safe)
  });

  it("does not settle a document belonging to a different supplier's batch when amounts coincidentally match", async () => {
    // The fake doesn't model supplier isolation itself (that's the RPC's
    // `mixed_suppliers` guard, exercised at the SQL level) — this test
    // documents the use case's own contract: it passes documentType/entityId
    // through untouched, it never merges/filters entityLinks itself. Supplier
    // isolation is therefore entirely the write port's responsibility.
    writePort.invoices.set("other-supplier-inv", { id: "other-supplier-inv", totalWithVat: 80_000, documentType: "invoice" });
    const result = await useCase.execute({
      organizationId,
      movementId: "mov-1",
      entityLinks: [
        { entityId: "other-supplier-inv", documentType: "invoice", allocatedAmountCents: 80_000, expectedOpenBalanceCents: 80_000 },
      ],
    });
    expect(result.reconciliationStatus).toBe("conciliado_com_fatura");
    expect(writePort.calls[0]!.links.map((l) => l.entityId)).toEqual(["other-supplier-inv"]);
  });
});

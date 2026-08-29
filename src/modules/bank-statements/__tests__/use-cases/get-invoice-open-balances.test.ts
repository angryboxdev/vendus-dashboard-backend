import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetInvoiceOpenBalancesUseCase } from "../../application/use-cases/get-invoice-open-balances.use-case.js";
import { FakeBankMovementEntityLinkRepository } from "../fakes/fake-bank-movement-entity-link-repository.js";
import { FakeInvoiceMatchRead } from "../fakes/fake-invoice-match-read.js";
import type { BankMovementEntityLink } from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";
import type { InvoiceMatchCandidate } from "../../domain/ports/out/invoice-match-read.port.js";

function makeInvoice(id: string, totalWithVat: number): InvoiceMatchCandidate {
  return {
    id,
    supplierId: "sup-1",
    supplierName: "Supplier",
    invoiceNumber: `INV-${id}`,
    totalWithVat,
    invoiceDate: "2026-07-01",
    dueDate: "2026-07-31",
    paidAt: null,
    status: "pending",
  };
}

function makeLink(
  movementId: string,
  entityId: string,
  allocatedAmountCents: number,
): BankMovementEntityLink {
  return {
    id: `link-${movementId}-${entityId}`,
    movementId,
    entityType: "invoice",
    entityId,
    amountCents: allocatedAmountCents,
    allocatedAmountCents,
    entityLabel: `Supplier — INV-${entityId}`,
  };
}

describe("GetInvoiceOpenBalancesUseCase", () => {
  const organizationId = mintOrganizationId("org-a");
  let linkRepo: FakeBankMovementEntityLinkRepository;
  let invoiceRead: FakeInvoiceMatchRead;
  let useCase: GetInvoiceOpenBalancesUseCase;

  beforeEach(() => {
    linkRepo = new FakeBankMovementEntityLinkRepository();
    invoiceRead = new FakeInvoiceMatchRead();
    useCase = new GetInvoiceOpenBalancesUseCase(linkRepo, invoiceRead);
  });

  it("returns empty object for empty input", async () => {
    const result = await useCase.execute({ organizationId, invoiceIds: [] });
    expect(result).toEqual({});
  });

  it("returns full totalWithVat as open balance when invoice has no links", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-1", 10_000)]);

    const result = await useCase.execute({ organizationId, invoiceIds: ["inv-1"] });

    expect(result["inv-1"]).toBe(10_000);
  });

  it("returns zero when invoice is fully allocated", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-1", 10_000)]);
    await linkRepo.saveAll(organizationId, [makeLink("mov-1", "inv-1", 10_000)]);

    const result = await useCase.execute({ organizationId, invoiceIds: ["inv-1"] });

    expect(result["inv-1"]).toBe(0);
  });

  it("returns remaining open balance for a partially-allocated invoice", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-1", 10_000)]);
    await linkRepo.saveAll(organizationId, [makeLink("mov-1", "inv-1", 3_000)]);

    const result = await useCase.execute({ organizationId, invoiceIds: ["inv-1"] });

    expect(result["inv-1"]).toBe(7_000);
  });

  it("aggregates allocations across multiple movements for the same invoice", async () => {
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-1", 10_000)]);
    await linkRepo.saveAll(organizationId, [
      makeLink("mov-1", "inv-1", 3_000),
      makeLink("mov-2", "inv-1", 4_000),
    ]);

    const result = await useCase.execute({ organizationId, invoiceIds: ["inv-1"] });

    expect(result["inv-1"]).toBe(3_000); // 10_000 - 3_000 - 4_000
  });

  it("handles multiple invoices in a single call", async () => {
    invoiceRead.setcandidates(organizationId, [
      makeInvoice("inv-1", 10_000),
      makeInvoice("inv-2", 20_000),
      makeInvoice("inv-3", 5_000),
    ]);
    await linkRepo.saveAll(organizationId, [
      makeLink("mov-1", "inv-1", 10_000), // fully allocated
      makeLink("mov-2", "inv-2", 8_000),  // partially allocated
      // inv-3 has no links → full balance
    ]);

    const result = await useCase.execute({ organizationId, invoiceIds: ["inv-1", "inv-2", "inv-3"] });

    expect(result["inv-1"]).toBe(0);
    expect(result["inv-2"]).toBe(12_000);
    expect(result["inv-3"]).toBe(5_000);
  });

  it("never returns a negative balance (clamps to 0)", async () => {
    // Over-allocated edge case
    invoiceRead.setcandidates(organizationId, [makeInvoice("inv-1", 5_000)]);
    await linkRepo.saveAll(organizationId, [makeLink("mov-1", "inv-1", 6_000)]);

    const result = await useCase.execute({ organizationId, invoiceIds: ["inv-1"] });

    expect(result["inv-1"]).toBe(0);
  });
});

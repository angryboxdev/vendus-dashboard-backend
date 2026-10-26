import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetGroupedSettlementSuggestionsUseCase } from "../../application/use-cases/get-grouped-settlement-suggestions.use-case.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeMovementMatchHint } from "../fakes/fake-movement-match-hint.js";
import { FakeInvoiceMatchRead } from "../fakes/fake-invoice-match-read.js";
import { FakeBankMovementEntityLinkRepository } from "../fakes/fake-bank-movement-entity-link-repository.js";
import { FakeSupplierNameRead } from "../fakes/fake-supplier-name-read.js";
import type { InvoiceMatchCandidate } from "../../domain/ports/out/invoice-match-read.port.js";
import type { FindMovementCandidatesPort, MovementCandidate } from "../../domain/ports/in/bank-statement.ports.js";

// Dados fictícios: documento de pagamento das águas — fatura da água + fatura dos resíduos
// (emitentes diferentes), um só débito direto de 90,03 €.
const organizationId = mintOrganizationId("org-a");

class NoSingleCandidates implements FindMovementCandidatesPort {
  result: MovementCandidate[] = [];
  async execute(): Promise<MovementCandidate[]> {
    return this.result;
  }
}

const debit = (amount: number, date = "2026-11-03") =>
  BankMovement.create({
    statementImportId: "stmt-1",
    bookingDate: new Date(date),
    valueDate: new Date(date),
    description: "DD AGUAS EXEMPLO 0000000",
    amount,
    balanceAfter: 0,
    movementType: "debit",
    deduplicationHash: `hash-${amount}-${date}`,
  });

const doc = (o: Partial<InvoiceMatchCandidate> & Pick<InvoiceMatchCandidate, "id" | "totalWithVat">): InvoiceMatchCandidate => ({
  supplierId: "sup-agua",
  supplierName: "Águas Exemplo",
  invoiceNumber: `FT-${o.id}`,
  invoiceDate: "2026-10-19",
  dueDate: "2026-11-03",
  paidAt: null,
  status: "pending",
  currency: "EUR",
  documentType: "invoice",
  paymentGroupId: "grp-out",
  ...o,
});

const WATER = doc({ id: "inv-agua", totalWithVat: 5998 });
const WASTE = doc({ id: "inv-residuos", totalWithVat: 3005, supplierId: "sup-residuos", supplierName: "Resíduos Exemplo" });

describe("Liquidação agrupada — documento de pagamento com várias faturas", () => {
  let movementRepo: FakeBankMovementRepository;
  let invoiceRead: FakeInvoiceMatchRead;
  let linkRepo: FakeBankMovementEntityLinkRepository;
  let single: NoSingleCandidates;
  let useCase: GetGroupedSettlementSuggestionsUseCase;

  beforeEach(() => {
    movementRepo = new FakeBankMovementRepository();
    invoiceRead = new FakeInvoiceMatchRead();
    linkRepo = new FakeBankMovementEntityLinkRepository();
    single = new NoSingleCandidates();
    useCase = new GetGroupedSettlementSuggestionsUseCase(movementRepo, single, new FakeMovementMatchHint(), invoiceRead, linkRepo, new FakeSupplierNameRead());
  });

  it("o débito de 90,03 € sugere as duas faturas do documento (emitentes diferentes)", async () => {
    const m = debit(9003);
    await movementRepo.saveBulk(organizationId, [m]);
    invoiceRead.setcandidates(organizationId, [WATER, WASTE]);

    const r = await useCase.execute({ organizationId, movementId: m.id });

    expect(r.primaryCombination).toMatchObject({ paymentGroupId: "grp-out", documentCount: 2, netTotalCents: 9003, isExactMatch: true });
    expect(r.primaryCombination!.docs.map((d) => [d.entityId, d.openBalanceCents])).toEqual([["inv-agua", 5998], ["inv-residuos", 3005]]);
    expect(r.supplierName).toBe("Águas Exemplo + Resíduos Exemplo");
  });

  it("valor diferente da soma → não sugere o documento", async () => {
    const m = debit(9000);
    await movementRepo.saveBulk(organizationId, [m]);
    invoiceRead.setcandidates(organizationId, [WATER, WASTE]);
    const r = await useCase.execute({ organizationId, movementId: m.id });
    expect(r.primaryCombination).toBeNull();
  });

  it("uma fatura do documento já paga por outro movimento → o documento deixa de ser sugerido inteiro", async () => {
    const m = debit(9003);
    await movementRepo.saveBulk(organizationId, [m]);
    invoiceRead.setcandidates(organizationId, [WATER, WASTE]);
    await linkRepo.saveAll(organizationId, [
      { id: "l-1", movementId: "outro", entityType: "invoice", entityId: "inv-residuos", amountCents: 3005, allocatedAmountCents: 3005, entityLabel: "x" },
    ]);
    const r = await useCase.execute({ organizationId, movementId: m.id });
    expect(r.primaryCombination?.paymentGroupId).toBeUndefined();
  });

  it("documento fora da janela de datas não é sugerido", async () => {
    const m = debit(9003, "2027-03-01");
    await movementRepo.saveBulk(organizationId, [m]);
    invoiceRead.setcandidates(organizationId, [WATER, WASTE]);
    const r = await useCase.execute({ organizationId, movementId: m.id });
    expect(r.primaryCombination).toBeNull();
  });

  it("um match 1:1 exato continua a ter prioridade", async () => {
    const m = debit(9003);
    await movementRepo.saveBulk(organizationId, [m]);
    invoiceRead.setcandidates(organizationId, [WATER, WASTE]);
    single.result = [{ entityType: "invoice", entityId: "inv-x", entityLabel: "Outro — FT-x", supplierId: "sup-x", amountCents: 9003, openBalanceCents: 9003, date: "2026-11-01", confidence: 0.9 }];
    const r = await useCase.execute({ organizationId, movementId: m.id });
    expect(r.singleExactMatch?.entityId).toBe("inv-x");
    expect(r.primaryCombination).toBeNull();
  });
});

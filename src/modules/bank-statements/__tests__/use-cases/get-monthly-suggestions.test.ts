import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetMonthlySuggestionsUseCase } from "../../application/use-cases/get-monthly-suggestions.use-case.js";
import { FindMovementCandidatesUseCase } from "../../application/use-cases/find-movement-candidates.use-case.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeInvoiceMatchRead } from "../fakes/fake-invoice-match-read.js";
import { FakePayableEntryMatchRead } from "../fakes/fake-payable-entry-match-read.js";
import { FakeMovementMatchHint } from "../fakes/fake-movement-match-hint.js";
import { FakeBankMovementEntityLinkRepository } from "../fakes/fake-bank-movement-entity-link-repository.js";
import type { InvoiceMatchCandidate } from "../../domain/ports/out/invoice-match-read.port.js";

const ACCOUNT_ID = "acc-1";
let hashCounter = 0;

function makeMovement(overrides: {
  bookingDate: Date;
  description: string;
  amount?: number;
  movementType?: "debit" | "credit";
}): BankMovement {
  hashCounter += 1;
  return BankMovement.create({
    bankAccountId: ACCOUNT_ID,
    statementImportId: "stmt-1",
    bookingDate: overrides.bookingDate,
    valueDate: overrides.bookingDate,
    description: overrides.description,
    amount: overrides.amount ?? 50_000,
    balanceAfter: 100_000,
    movementType: overrides.movementType ?? "debit",
    deduplicationHash: `h${hashCounter}`,
  });
}

function makeInvoiceCandidate(overrides: Partial<InvoiceMatchCandidate> = {}): InvoiceMatchCandidate {
  return {
    id: "inv-1",
    supplierId: "sup-1",
    supplierName: "EDP SA",
    invoiceNumber: "FT 2026/100",
    totalWithVat: 50_000,
    invoiceDate: "2026-08-01",
    dueDate: "2026-08-05",
    paidAt: null,
    status: "pending",
    ...overrides,
  };
}

describe("GetMonthlySuggestionsUseCase", () => {
  const organizationId = mintOrganizationId("org-a");
  let movementRepo: FakeBankMovementRepository;
  let invoiceRead: FakeInvoiceMatchRead;
  let payableRead: FakePayableEntryMatchRead;
  let hint: FakeMovementMatchHint;
  let linkRepo: FakeBankMovementEntityLinkRepository;
  let findCandidates: FindMovementCandidatesUseCase;
  let useCase: GetMonthlySuggestionsUseCase;

  beforeEach(() => {
    movementRepo = new FakeBankMovementRepository();
    invoiceRead = new FakeInvoiceMatchRead();
    payableRead = new FakePayableEntryMatchRead();
    hint = new FakeMovementMatchHint();
    linkRepo = new FakeBankMovementEntityLinkRepository();
    findCandidates = new FindMovementCandidatesUseCase(movementRepo, invoiceRead, payableRead, hint, linkRepo);
    useCase = new GetMonthlySuggestionsUseCase(movementRepo, findCandidates);
  });

  it("devolve listas vazias quando não há movimentos pendentes no mês", async () => {
    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2026, month: 8 });
    expect(result.entityMatches).toHaveLength(0);
    expect(result.repeatJustifications).toHaveLength(0);
  });

  it("sugere fatura correspondente para um movimento pendente do mês", async () => {
    const movement = makeMovement({ bookingDate: new Date("2026-08-10T00:00:00.000Z"), description: "PAGAMENTO EDP SA" });
    await movementRepo.saveBulk(organizationId, [movement]);
    invoiceRead.setcandidates(organizationId, [makeInvoiceCandidate()]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2026, month: 8 });

    expect(result.entityMatches).toHaveLength(1);
    expect(result.entityMatches[0]!.movementId).toBe(movement.id);
    expect(result.entityMatches[0]!.entityId).toBe("inv-1");
    expect(result.repeatJustifications).toHaveLength(0);
  });

  it("sugere repetir a classificação de um movimento recorrente de um mês anterior (caso Gabriel Gomes)", async () => {
    const july = makeMovement({
      bookingDate: new Date("2026-07-15T00:00:00.000Z"),
      description: "TRF P/ GABRIEL GOMES BERNARDO DE SOUZA",
    }).classify({
      justificationType: "recibo_comprovativo",
      notes: "Salário",
      costCenterGroupId: "grp-pes",
      costCenterCategoryId: "cat-salarios",
    });
    const august = makeMovement({
      bookingDate: new Date("2026-08-15T00:00:00.000Z"),
      description: "TRF P/ GABRIEL GOMES BERNARDO DE SOUZA",
    });
    await movementRepo.saveBulk(organizationId, [july, august]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2026, month: 8 });

    expect(result.entityMatches).toHaveLength(0);
    expect(result.repeatJustifications).toHaveLength(1);
    const suggestion = result.repeatJustifications[0]!;
    expect(suggestion.movementId).toBe(august.id);
    expect(suggestion.sourceMovementId).toBe(july.id);
    expect(suggestion.justificationType).toBe("recibo_comprovativo");
    expect(suggestion.notes).toBe("Salário");
    expect(suggestion.costCenterCategoryId).toBe("cat-salarios");
  });

  it("não sugere repetir classificação quando o movimento anterior foi conciliado COM fatura (regressão: Makro/DD Águas e Energia apareciam indevidamente)", async () => {
    // multiReconcile() é o que a conciliação real com fatura chama — grava
    // justificationType: "fatura" mas matchedEntityType: null (os links reais
    // vivem em bank_movement_entity_links, não neste campo). O índice de
    // recorrência tem de excluir por justificationType === "fatura", não só
    // por matchedEntityType.
    const july = makeMovement({
      bookingDate: new Date("2026-07-10T00:00:00.000Z"),
      description: "PAGAMENTO MAKRO PORTUGAL",
    }).multiReconcile(0);
    const august = makeMovement({
      bookingDate: new Date("2026-08-10T00:00:00.000Z"),
      description: "PAGAMENTO MAKRO PORTUGAL",
    });
    await movementRepo.saveBulk(organizationId, [july, august]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2026, month: 8 });
    expect(result.repeatJustifications).toHaveLength(0);
  });

  it("não sugere repetição quando o movimento anterior ficou sem justificação (sem_justificativa nunca resolve o movimento)", async () => {
    const july = makeMovement({
      bookingDate: new Date("2026-07-10T00:00:00.000Z"),
      description: "LEVANTAMENTO ATM",
    }).classify({ justificationType: "sem_justificativa", notes: "obrigatório" });
    const august = makeMovement({
      bookingDate: new Date("2026-08-10T00:00:00.000Z"),
      description: "LEVANTAMENTO ATM",
    });
    await movementRepo.saveBulk(organizationId, [july, august]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2026, month: 8 });
    expect(result.repeatJustifications).toHaveLength(0);
  });

  it("não sugere repetição quando o movimento anterior foi classificado com uma ocorrência de recorrência vinculada", async () => {
    const july = makeMovement({
      bookingDate: new Date("2026-07-10T00:00:00.000Z"),
      description: "PAGAMENTO RENDA LOJA",
    }).classify({ justificationType: "contrato_recorrencia", matchedEntityType: "recurrence_occurrence", matchedEntityId: "occ-jul" });
    const august = makeMovement({
      bookingDate: new Date("2026-08-10T00:00:00.000Z"),
      description: "PAGAMENTO RENDA LOJA",
    });
    await movementRepo.saveBulk(organizationId, [july, august]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2026, month: 8 });
    expect(result.repeatJustifications).toHaveLength(0);
  });

  it("não sugere repetição quando o movimento anterior não foi classificado (crédito auto-resolvido)", async () => {
    const july = makeMovement({
      bookingDate: new Date("2026-07-15T00:00:00.000Z"),
      description: "TRANSFERENCIA RECEBIDA CLIENTE X",
      movementType: "credit",
    });
    const august = makeMovement({
      bookingDate: new Date("2026-08-15T00:00:00.000Z"),
      description: "TRANSFERENCIA RECEBIDA CLIENTE X",
    });
    await movementRepo.saveBulk(organizationId, [july, august]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2026, month: 8 });
    expect(result.repeatJustifications).toHaveLength(0);
  });

  it("usa a ocorrência mais recente quando há vários meses anteriores com a mesma descrição", async () => {
    const june = makeMovement({
      bookingDate: new Date("2026-06-15T00:00:00.000Z"),
      description: "TRF P/ GABRIEL GOMES BERNARDO DE SOUZA",
    }).classify({ justificationType: "recibo_comprovativo", notes: "Salário antigo" });
    const july = makeMovement({
      bookingDate: new Date("2026-07-15T00:00:00.000Z"),
      description: "TRF P/ GABRIEL GOMES BERNARDO DE SOUZA",
    }).classify({ justificationType: "recibo_comprovativo", notes: "Salário novo" });
    const august = makeMovement({
      bookingDate: new Date("2026-08-15T00:00:00.000Z"),
      description: "TRF P/ GABRIEL GOMES BERNARDO DE SOUZA",
    });
    await movementRepo.saveBulk(organizationId, [june, july, august]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2026, month: 8 });
    expect(result.repeatJustifications[0]!.sourceMovementId).toBe(july.id);
    expect(result.repeatJustifications[0]!.notes).toBe("Salário novo");
  });

  it("prioriza o match de fatura sobre a repetição de classificação quando ambos existem", async () => {
    const july = makeMovement({
      bookingDate: new Date("2026-07-15T00:00:00.000Z"),
      description: "PAGAMENTO EDP SA",
    }).classify({ justificationType: "despesa_bancaria_automatica" });
    const august = makeMovement({
      bookingDate: new Date("2026-08-15T00:00:00.000Z"),
      description: "PAGAMENTO EDP SA",
    });
    await movementRepo.saveBulk(organizationId, [july, august]);
    invoiceRead.setcandidates(organizationId, [makeInvoiceCandidate()]);

    const result = await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2026, month: 8 });
    expect(result.entityMatches).toHaveLength(1);
    expect(result.repeatJustifications).toHaveLength(0);
  });
});

import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ResolveStatementAccountUseCase } from "../../application/use-cases/resolve-statement-account.use-case.js";
import { FakeBankRepository } from "../fakes/fake-bank-repository.js";
import { FakeBankAccountRepository } from "../fakes/fake-bank-account-repository.js";
import { Bank } from "../../domain/entities/bank.js";
import { BankAccount } from "../../domain/entities/bank-account.js";
import type { ResolveStatementAccountCommand } from "../../domain/ports/in/bank-accounts.ports.js";

const organizationId = mintOrganizationId("org-a");
// Dados fictícios.
const command = (over: Partial<ResolveStatementAccountCommand> = {}): ResolveStatementAccountCommand => ({
  organizationId,
  bankName: "Millennium BCP",
  logoKey: "millennium_bcp",
  statementFormat: "millennium_bcp_pdf",
  color: "#C5004F",
  country: "PT",
  bic: "BCOMPTPL",
  iban: "PT50003300001234567890101",
  accountNumber: "12345678901",
  accountLabel: "CONTA NEGOCIO EMP.",
  create: true,
  ...over,
});

describe("ResolveStatementAccountUseCase (banco/conta nascem do primeiro extrato)", () => {
  let banks: FakeBankRepository;
  let accounts: FakeBankAccountRepository;
  let useCase: ResolveStatementAccountUseCase;

  beforeEach(() => {
    banks = new FakeBankRepository();
    accounts = new FakeBankAccountRepository();
    useCase = new ResolveStatementAccountUseCase(banks, accounts);
  });

  it("primeiro extrato de uma conta nova: cria o banco e a conta com os dados do extrato", async () => {
    const r = await useCase.execute(command());
    expect(r).toMatchObject({ status: "created", bankName: "Millennium BCP", bankIsNew: true, accountName: "Conta Negocio Emp." });
    const [bank] = await banks.findAll(organizationId);
    expect(bank).toMatchObject({ logoKey: "millennium_bcp", statementFormat: "millennium_bcp_pdf", bic: "BCOMPTPL", country: "PT" });
    const [account] = await accounts.findByBankId(organizationId, bank!.id);
    expect(account).toMatchObject({ type: "account", iban: "PT50003300001234567890101", accountNumber: "12345678901", accountType: "corrente" });
  });

  it("segundo extrato da mesma conta: reutiliza banco e conta (sem duplicados)", async () => {
    const first = await useCase.execute(command());
    const second = await useCase.execute(command());
    expect(second).toMatchObject({ status: "existing", accountId: first!.accountId, bankId: first!.bankId });
    expect(await banks.findAll(organizationId)).toHaveLength(1);
  });

  it("conta registada à mão com o IBAN com espaços, ou só com o nº com zeros à esquerda → reconhecida", async () => {
    const bank = Bank.create({ name: "Millennium", logoKey: "millennium_bcp", color: "#C5004F", country: "PT", statementFormat: "millennium_bcp_csv" });
    await banks.save(organizationId, bank);
    const a = BankAccount.create({ bankId: bank.id, type: "account", nickname: "Conta principal", accountNumber: "0000012345678901" });
    await accounts.save(organizationId, a);
    expect(await useCase.execute(command({ iban: null }))).toMatchObject({ status: "existing", accountId: a.id, accountName: "Conta principal" });
    const b = BankAccount.create({ bankId: bank.id, type: "account", iban: "PT50 0033 0000 9999 8888 7770 1" });
    await accounts.save(organizationId, b);
    expect(await useCase.execute(command({ iban: "PT50003300009999888877701", accountNumber: null }))).toMatchObject({ status: "existing", accountId: b.id });
  });

  it("banco já existe mas a conta é nova: cria só a conta, no banco existente", async () => {
    const bank = Bank.create({ name: "Millennium BCP", logoKey: "millennium_bcp", color: "#C5004F", country: "PT", statementFormat: "millennium_bcp_csv" });
    await banks.save(organizationId, bank);
    const r = await useCase.execute(command());
    expect(r).toMatchObject({ status: "created", bankId: bank.id, bankIsNew: false });
  });

  it("pré-visualização (create=false): diz o que faria, sem gravar nada", async () => {
    expect(await useCase.execute(command({ create: false }))).toMatchObject({ status: "to_create", bankIsNew: true, accountId: null });
    expect(await banks.findAll(organizationId)).toHaveLength(0);
  });

  it("extrato sem IBAN nem nº de conta → null (não há como identificar)", async () => {
    expect(await useCase.execute(command({ iban: null, accountNumber: null }))).toBeNull();
  });

  it("um cartão com os mesmos dígitos nunca é confundido com a conta", async () => {
    const bank = Bank.create({ name: "Millennium BCP", logoKey: "millennium_bcp", color: "#C5004F", country: "PT", statementFormat: "millennium_bcp_csv" });
    await banks.save(organizationId, bank);
    await accounts.save(organizationId, BankAccount.create({ bankId: bank.id, type: "credit_card", lastFourDigits: "8901", cardName: "Cartão" }));
    expect(await useCase.execute(command())).toMatchObject({ status: "created" });
  });
});

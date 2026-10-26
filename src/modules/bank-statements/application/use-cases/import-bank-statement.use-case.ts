import { createHash } from "node:crypto";
import { BankStatementImport } from "../../domain/entities/bank-statement-import.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { ReconciliationCalculatorService } from "../../domain/services/reconciliation-calculator.service.js";
import { selectNewMovements } from "../../domain/services/movement-dedup.service.js";
import { AutoMatchingService } from "../../domain/services/auto-matching.service.js";
import type { BankReconciliationRuleRepositoryPort } from "../../domain/ports/out/bank-reconciliation-rule-repository.port.js";
import type { StatementAccountResolution, StatementAccountResolverPort } from "../../domain/ports/out/statement-account-resolver.port.js";
import type { BankStatementImportRepositoryPort } from "../../domain/ports/out/bank-statement-import-repository.port.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { BankAccountReadPort } from "../../domain/ports/out/bank-account-read.port.js";
import type {
  ImportBankStatementCommand,
  ImportBankStatementPort,
  ImportBankStatementResult,
} from "../../domain/ports/in/bank-statement.ports.js";

function buildDeduplicationHash(
  accountNumber: string,
  bookingDate: Date,
  description: string,
  amount: number,
  movementType: string
): string {
  const input = [
    accountNumber,
    bookingDate.toISOString().slice(0, 10),
    description,
    amount.toString(),
    movementType,
  ].join("|");
  return createHash("sha256").update(input).digest("hex");
}

export class ImportBankStatementUseCase implements ImportBankStatementPort {
  private readonly calculator = new ReconciliationCalculatorService();

  constructor(
    private readonly statementRepo: BankStatementImportRepositoryPort,
    private readonly movementRepo: BankMovementRepositoryPort,
    private readonly bankAccountRead?: BankAccountReadPort,
    /** V2 (F3): banco e conta encontrados ou criados a partir do extrato (`command.autoAccount`). */
    private readonly accountResolver?: StatementAccountResolverPort,
    /** «Movimentos recorrentes»: os movimentos novos que batem com uma regra ficam logo conciliados. */
    private readonly ruleRepo?: BankReconciliationRuleRepositoryPort,
  ) {}

  /** Movimentos já gravados da mesma conta no período do ficheiro (pela conta ligada; senão pelo nº de conta dos extratos). */
  private async existingMovements(
    organizationId: ImportBankStatementCommand["organizationId"],
    bankAccountId: string | null,
    accountNumber: string,
    incoming: { bookingDate: Date }[],
  ): Promise<BankMovement[]> {
    if (incoming.length === 0) return [];
    const times = incoming.map((m) => m.bookingDate.getTime());
    const from = new Date(Math.min(...times));
    const to = new Date(Math.max(...times));
    const inRange = (m: BankMovement) => m.bookingDate.getTime() >= from.getTime() && m.bookingDate.getTime() <= to.getTime();
    if (bankAccountId) return (await this.movementRepo.findByAccountAndPeriod(organizationId, bankAccountId, from, to)).filter(inRange);
    const statements = await this.statementRepo.findAll(organizationId, { accountNumber });
    const lists = await Promise.all(statements.map((s) => this.movementRepo.findByStatementId(organizationId, s.id)));
    return lists.flat().filter(inRange);
  }

  async execute(command: ImportBankStatementCommand): Promise<ImportBankStatementResult> {
    const { organizationId } = command;

    // 1. Resolve bank account linkage
    let resolvedBankAccountId: string | null = command.bankAccountId ?? null;
    let accountMatched = resolvedBankAccountId != null;
    let accountResolution: StatementAccountResolution | null | undefined;

    // Extrato reconhecido sem conta escolhida: encontra a conta pelo IBAN/nº ou cria banco + conta.
    if (!accountMatched && command.autoAccount && this.accountResolver) {
      accountResolution = await this.accountResolver.resolve(organizationId, command.autoAccount, { create: true });
      if (accountResolution?.accountId) {
        resolvedBankAccountId = accountResolution.accountId;
        accountMatched = true;
      }
    }

    if (!accountMatched && this.bankAccountRead && command.accountNumber) {
      const match = await this.bankAccountRead.findByAccountNumber(organizationId, command.accountNumber);
      if (match) {
        resolvedBankAccountId = match.id;
        accountMatched = true;
      }
    }

    // 2. Create import header
    const statement = BankStatementImport.create({
      bankAccountId: resolvedBankAccountId,
      bankName: command.bankName,
      accountNumber: command.accountNumber,
      periodStart: command.periodStart,
      periodEnd: command.periodEnd,
      ...(command.currency !== undefined ? { currency: command.currency } : {}),
      sourceType: command.sourceType,
      ...(command.sourceFileName !== undefined ? { sourceFileName: command.sourceFileName } : {}),
      openingBalance: command.openingBalance,
      closingBalance: command.closingBalance,
    });

    await this.statementRepo.save(organizationId, statement);

    // 3. Build movements, skipping duplicates
    let toSave: BankMovement[] = [];
    let skippedDuplicates = 0;
    // Hashes já colocados em toSave nesta própria execução — existsByHash só vê
    // o que já está na BD, por isso duas linhas do MESMO ficheiro com o mesmo
    // hash (ex: dois pagamentos iguais no mesmo dia com a mesma descrição)
    // passavam as duas na checagem contra a BD e rebentavam a constraint UNIQUE
    // (org_id, deduplication_hash) no insert em lote.
    const seenHashes = new Set<string>();

    // If the file didn't supply balances (all zero), compute them from openingBalance.
    // Sort ascending by bookingDate first — files like BCP XLSX come newest-first.
    const allBalancesZero = command.movements.every((m) => m.balanceAfter === 0);
    const resolvedMovements = allBalancesZero
      ? (() => {
          const sorted = [...command.movements].sort(
            (a, b) => a.bookingDate.getTime() - b.bookingDate.getTime()
          );
          let running = command.openingBalance;
          return sorted.map((m) => {
            running += m.movementType === "credit" ? m.amount : -m.amount;
            return { ...m, balanceAfter: running };
          });
        })()
      : command.movements;

    // Duplicados contra o que já está gravado da mesma conta, um-para-um e pelo saldo após o movimento
    // quando o ficheiro o traz (ver `selectNewMovements`). Dois movimentos iguais no mesmo ficheiro
    // são dois movimentos — já não se perde o segundo.
    const existing = await this.existingMovements(organizationId, resolvedBankAccountId, command.accountNumber, resolvedMovements);
    const { fresh, duplicates } = selectNewMovements(resolvedMovements, existing, !allBalancesZero);
    skippedDuplicates += duplicates;

    for (const raw of fresh) {
      // O hash já não decide duplicados (fá-lo a correspondência acima); só tem de ser único: inclui o
      // extrato e a ordem de repetição dentro dele.
      let hash = buildDeduplicationHash(command.accountNumber, raw.bookingDate, `${raw.description}|${raw.balanceAfter}|${statement.id}`, raw.amount, raw.movementType);
      for (let n = 1; seenHashes.has(hash); n++) {
        hash = buildDeduplicationHash(command.accountNumber, raw.bookingDate, `${raw.description}|${raw.balanceAfter}|${statement.id}|${n}`, raw.amount, raw.movementType);
      }

      seenHashes.add(hash);
      toSave.push(
        BankMovement.create({
          bankAccountId: resolvedBankAccountId,
          statementImportId: statement.id,
          bookingDate: raw.bookingDate,
          valueDate: raw.valueDate,
          description: raw.description,
          amount: raw.amount,
          balanceAfter: raw.balanceAfter,
          ...(command.currency !== undefined ? { currency: command.currency } : {}),
          movementType: raw.movementType,
          deduplicationHash: hash,
        })
      );
    }

    // «Movimentos recorrentes»: aplicados antes de gravar (sem escritas extra); só com a conta conhecida.
    let autoClassifiedCount = 0;
    if (this.ruleRepo && resolvedBankAccountId && toSave.length > 0) {
      const rules = await this.ruleRepo.findAll(organizationId, true);
      const matches = new AutoMatchingService().applyRules(rules, toSave);
      const classified = new Map(matches.map(({ updated }) => [updated.id, updated]));
      toSave = toSave.map((m) => classified.get(m.id) ?? m);
      autoClassifiedCount = matches.length;
    }

    if (toSave.length > 0) {
      await this.movementRepo.saveBulk(organizationId, toSave);
    }

    // 4. Compute stats and update statement
    const stats = this.calculator.compute(command.openingBalance, toSave);
    const updated = statement.updateStats({
      importedMovementsCount: toSave.length,
      calculatedClosingBalance: stats.calculatedClosingBalance,
      reconciliationProgress: stats.reconciliationProgress,
    });

    await this.statementRepo.update(organizationId, updated);

    return {
      id: updated.id,
      ...(accountResolution !== undefined && { accountResolution }),
      bankAccountId: resolvedBankAccountId,
      accountMatched,
      parsedAccountNumber: command.accountNumber,
      bankName: updated.bankName,
      accountNumber: updated.accountNumber,
      importedMovementsCount: updated.importedMovementsCount,
      skippedDuplicates,
      autoClassifiedCount,
      calculatedClosingBalance: updated.calculatedClosingBalance,
      balanceDifference: updated.balanceDifference,
      reconciliationProgress: updated.reconciliationProgress,
      status: updated.status,
    };
  }
}

import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { BankStatementImportRepositoryPort } from "../../domain/ports/out/bank-statement-import-repository.port.js";
import type {
  AccountMonthStat,
  GetAccountCalendarPort,
  GetAccountCalendarQuery,
} from "../../domain/ports/in/bank-statement.ports.js";
import { RESOLVED_STATUSES } from "../../domain/entities/bank-movement.js";
import { computeMonthFigures, monthCoverage } from "../../domain/services/account-month-stats.service.js";

/** @deprecated Só para os campos antigos (`salesReconciledPercent`/`expensesReconciledPercent`): 100 quando não há nada. */
function legacyResolvedPercent(resolved: number, total: number): number {
  return total > 0 ? Math.round((resolved / total) * 100) : 100;
}

/**
 * Vista anual da conta: os 12 meses, cada um com estado do extrato («Sem extrato» quando nenhum extrato
 * importado cobre o mês e não há movimentos), conciliação real (nunca 100% num mês vazio) e fluxo de
 * caixa pelos movimentos importados (entradas, saídas, resultado, saldo inicial/final).
 */
export class GetAccountCalendarUseCase implements GetAccountCalendarPort {
  constructor(
    private readonly movementRepo: BankMovementRepositoryPort,
    private readonly statementRepo?: Pick<BankStatementImportRepositoryPort, "findAll">,
  ) {}

  async execute({ organizationId, bankAccountId, year }: GetAccountCalendarQuery): Promise<AccountMonthStat[]> {
    // Datas em UTC, como as dos movimentos — não dependem do fuso do servidor.
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year, 11, 31));
    const [movements, statements] = await Promise.all([
      this.movementRepo.findByAccountAndPeriod(organizationId, bankAccountId, from, to),
      this.statementRepo ? this.statementRepo.findAll(organizationId, { bankAccountId }) : Promise.resolve([]),
    ]);

    const byMonth = new Map<number, typeof movements>();
    for (const m of movements) {
      const month = m.bookingDate.getUTCMonth() + 1;
      byMonth.set(month, [...(byMonth.get(month) ?? []), m]);
    }

    const result: AccountMonthStat[] = [];
    for (let month = 1; month <= 12; month++) {
      const monthMovements = byMonth.get(month) ?? [];
      const coverage = monthCoverage(statements.map((s) => ({ start: s.periodStart, end: s.periodEnd })), year, month);
      const figures = computeMonthFigures(monthMovements, coverage.covered);

      const credits = monthMovements.filter((m) => m.movementType === "credit");
      const debits = monthMovements.filter((m) => m.movementType === "debit");
      result.push({
        year,
        month,
        ...figures,
        // Extrato só de parte do mês (ex.: 15–30 set.) — os totais são só desses dias.
        partialPeriod: figures.statementImported && coverage.partial,
        salesReconciledPercent: legacyResolvedPercent(credits.filter((m) => RESOLVED_STATUSES.has(m.reconciliationStatus)).length, credits.length),
        expensesReconciledPercent: legacyResolvedPercent(debits.filter((m) => RESOLVED_STATUSES.has(m.reconciliationStatus)).length, debits.length),
        totalCreditCents: figures.inflowCents,
        totalDebitCents: figures.outflowCents,
        balanceCents: figures.netCents,
      });
    }
    return result;
  }
}

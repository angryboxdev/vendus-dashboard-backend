import { RESOLVED_STATUSES, type BankMovement } from "../entities/bank-movement.js";

/**
 * Estado do mês na vista anual da conta (task «Conciliação bancária V2», §6.2/§12):
 * «extrato importado» e «conciliação» são coisas independentes — um mês sem extrato
 * nunca aparece como conciliado.
 */
export type MonthStatus = "no_statement" | "imported" | "partial" | "reconciled";

export interface MonthFigures {
  /** Há extrato importado que cobre o mês, ou movimentos importados nele. */
  statementImported: boolean;
  status: MonthStatus;
  totalMovements: number;
  /** Movimentos que contam para a conciliação: os importados menos os créditos aceites automaticamente (`isAutoAcceptedCredit`). */
  reconcilableMovements: number;
  reconciledMovements: number;
  /** `null` sem extrato ou sem movimentos — nunca um 100% inventado. */
  reconciledPercent: number | null;
  inflowCents: number;
  outflowCents: number;
  netCents: number;
  /** Saldo antes do primeiro movimento e depois do último (pela cadeia de saldos); `null` sem movimentos. */
  openingBalanceCents: number | null;
  closingBalanceCents: number | null;
}

const signed = (m: Pick<BankMovement, "amount" | "movementType">) => (m.movementType === "credit" ? m.amount : -m.amount);

/**
 * Primeiro e último saldo do mês pela cadeia «saldo antes → saldo depois»: o primeiro movimento é o
 * único cujo saldo anterior não é o saldo final de outro; o último é o único cujo saldo final não é o
 * saldo anterior de outro. Não depende da ordem dentro do dia (que o banco não garante). Se a cadeia
 * for ambígua (saldos calculados, repetidos…), usa a ordem recebida.
 */
export function monthBalances(movements: Pick<BankMovement, "amount" | "movementType" | "balanceAfter">[]): { opening: number | null; closing: number | null } {
  if (movements.length === 0) return { opening: null, closing: null };
  const before = movements.map((m) => m.balanceAfter - signed(m));
  const count = (values: number[]) => values.reduce((map, v) => map.set(v, (map.get(v) ?? 0) + 1), new Map<number, number>());
  const afterCounts = count(movements.map((m) => m.balanceAfter));
  const beforeCounts = count(before);
  const firsts = movements.map((_, i) => i).filter((i) => !afterCounts.has(before[i]!));
  const lasts = movements.map((_, i) => i).filter((i) => !beforeCounts.has(movements[i]!.balanceAfter));
  const first = firsts.length === 1 ? firsts[0]! : 0;
  const last = lasts.length === 1 ? lasts[0]! : movements.length - 1;
  return { opening: before[first]!, closing: movements[last]!.balanceAfter };
}

/**
 * Crédito aceite automaticamente na importação (`conciliado_sem_fatura` sem justificação nem
 * documento): não é trabalho de conciliação, por isso não entra na percentagem — senão um mês
 * acabado de importar nunca estaria a 0%. Um crédito justificado ou ligado a um documento conta.
 */
export function isAutoAcceptedCredit(m: Pick<BankMovement, "movementType" | "reconciliationStatus" | "justificationType" | "matchedEntityType">): boolean {
  return m.movementType === "credit" && m.reconciliationStatus === "conciliado_sem_fatura" && m.justificationType === null && m.matchedEntityType === null;
}

export function computeMonthFigures(movements: BankMovement[], statementCoversMonth: boolean): MonthFigures {
  const statementImported = statementCoversMonth || movements.length > 0;
  const reconcilable = movements.filter((m) => !isAutoAcceptedCredit(m));
  const reconciled = reconcilable.filter((m) => RESOLVED_STATUSES.has(m.reconciliationStatus)).length;
  const inflowCents = movements.filter((m) => m.movementType === "credit").reduce((s, m) => s + m.amount, 0);
  const outflowCents = movements.filter((m) => m.movementType === "debit").reduce((s, m) => s + m.amount, 0);
  // Só com extrato e com movimentos; sem nada para conciliar (só créditos aceites) o mês está feito.
  const reconciledPercent = !statementImported || movements.length === 0 ? null : reconcilable.length === 0 ? 100 : Math.round((reconciled / reconcilable.length) * 100);
  const status: MonthStatus = !statementImported
    ? "no_statement"
    : movements.length === 0 || (reconcilable.length > 0 && reconciled === 0)
      ? "imported"
      : reconciled === reconcilable.length
        ? "reconciled"
        : "partial";
  const { opening, closing } = monthBalances(movements);
  return {
    statementImported,
    status,
    totalMovements: movements.length,
    reconcilableMovements: reconcilable.length,
    reconciledMovements: reconciled,
    reconciledPercent,
    inflowCents,
    outflowCents,
    netCents: inflowCents - outflowCents,
    openingBalanceCents: opening,
    closingBalanceCents: closing,
  };
}

/** O período do extrato toca o mês (1.º ao último dia, datas de calendário). */
export function periodCoversMonth(period: { start: Date; end: Date }, year: number, month: number): boolean {
  const ym = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  const target = year * 12 + (month - 1);
  return ym(period.start) <= target && target <= ym(period.end);
}

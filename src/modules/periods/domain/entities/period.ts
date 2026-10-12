/** Período de processamento (Eng. Reversa 11/13 `payroll_period`; ADR-0031). */
export interface PayPeriod {
  id: string;
  scopeType: "organization" | "location";
  scopeId: string | null;
  startDate: string;
  endDate: string;
  status: "open" | "closed" | "reopened";
}

/** Totais de um colaborador no período (fotografia do fecho — TK-19). */
export interface EmployeeTotals {
  employeeId: string;
  workedSeconds: number;
  theoreticalSeconds: number;
  excessSeconds: number;
  nightSeconds: number;
  pendingSeconds: number;
  /** Ausências aprovadas no período, por tipo. */
  absences: { typeId: string; typeName: string; code: string | null; unit: "days" | "hours"; amount: number }[];
  /** Soma dos movimentos do banco com data no período e horas pagas. */
  bankSeconds: number;
  bankPaidSeconds: number;
  /** Horas por centro (faturação por centro). */
  byLocation: { locationId: string | null; workedSeconds: number }[];
}

export interface PendingItem {
  type: "incident" | "absence_request" | "correction_request" | "excess_validation";
  id: string;
  employeeId: string;
  date: string;
  label: string;
}

export interface Closure {
  id: string;
  periodId: string;
  closureNo: number;
  closedBy: string;
  exceptionReason: string | null;
  exceptions: PendingItem[];
  totals: EmployeeTotals[];
  diff: TotalsDiff[] | null;
  createdAt: string;
}

export interface TotalsDiff {
  employeeId: string;
  field: string;
  before: number;
  after: number;
}

export interface Reopening {
  id: string;
  periodId: string;
  requestedBy: string;
  requestedByUserId: string;
  reason: string;
  approvals: { userId: string; by: string; at: string }[];
  status: "pending" | "approved" | "rejected";
}

export interface ExportJob {
  id: string;
  periodId: string;
  kind: "payroll" | "billing_location";
  requestedBy: string;
  requestedByUserId: string;
  includeSensitive: boolean;
  status: "queued" | "running" | "done" | "failed";
  error: string | null;
  fileName: string | null;
  totals: Record<string, number> | null;
  expiresAt: string | null;
  createdAt: string;
}

/** Dois períodos do mesmo âmbito sobrepõem-se? */
export const overlapsPeriod = (a: Pick<PayPeriod, "startDate" | "endDate">, b: Pick<PayPeriod, "startDate" | "endDate">) => !(a.endDate < b.startDate || b.endDate < a.startDate);

const NUMERIC: (keyof EmployeeTotals)[] = ["workedSeconds", "theoreticalSeconds", "excessSeconds", "nightSeconds", "pendingSeconds", "bankSeconds", "bankPaidSeconds"];

/** Diferenças por colaborador entre dois fechos (registadas ao voltar a fechar). */
export function diffTotals(before: EmployeeTotals[], after: EmployeeTotals[]): TotalsDiff[] {
  const out: TotalsDiff[] = [];
  const ids = new Set([...before, ...after].map((t) => t.employeeId));
  for (const id of ids) {
    const b = before.find((t) => t.employeeId === id);
    const a = after.find((t) => t.employeeId === id);
    for (const f of NUMERIC) {
      const bv = (b?.[f] as number | undefined) ?? 0;
      const av = (a?.[f] as number | undefined) ?? 0;
      if (bv !== av) out.push({ employeeId: id, field: f, before: bv, after: av });
    }
  }
  return out;
}

/** Somas do período (para conferir — TK-19). */
export function sumTotals(totals: EmployeeTotals[]): Record<string, number> {
  const sum = (f: keyof EmployeeTotals) => totals.reduce((s, t) => s + ((t[f] as number) ?? 0), 0);
  return Object.fromEntries(NUMERIC.map((f) => [f, sum(f)]));
}

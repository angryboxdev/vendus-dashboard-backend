/** Violação de uma restrição da escala (RE-16, RE-18). */
export type Severity = "warning" | "block";
export type RuleKey = "overlap" | "min_rest" | "max_daily" | "max_weekly" | "max_annual" | "absence";

export interface Violation {
  rule: RuleKey;
  severity: Severity;
  employeeId: string;
  workDate: string;
  message: string;
}

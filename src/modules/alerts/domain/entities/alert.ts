/**
 * Alertas (Eng. Reversa 10/17; RE-24, RE-36 — ADR-0033): cada alerta tem
 * origem, dono, estado, prazo (SLA) e escalonamento; fecha sozinho quando a
 * origem deixa de estar pendente, ou à mão com nota.
 */
export type AlertKind = "pending_absence" | "pending_correction" | "pending_reopening" | "pending_swap" | "pending_custom_request" | "contract_end" | "probation_end" | "overdue_task";
export const ALERT_KINDS: AlertKind[] = ["pending_absence", "pending_correction", "pending_reopening", "pending_swap", "pending_custom_request", "contract_end", "probation_end", "overdue_task"];

export interface AlertRule {
  id: string;
  kind: AlertKind;
  thresholdDays: number;
  /** "admins" | "profile:<uuid>" | "user:<id>" */
  owner: string;
  slaHours: number;
  escalateTo: string | null;
  enabled: boolean;
}

export type AlertRuleInput = Omit<AlertRule, "id">;

export interface Alert {
  id: string;
  ruleId: string;
  sourceType: string;
  sourceId: string;
  employeeId: string | null;
  title: string;
  ownerUserIds: string[];
  status: "open" | "in_progress" | "closed";
  dueAt: string;
  escalatedAt: string | null;
  escalatedTo: string[] | null;
  takenBy: string | null;
  closedBy: string | null;
  closedAt: string | null;
  closeNote: string | null;
  createdAt: string;
}

/** Algo que pode originar um alerta: pendente desde, ou a acontecer até. */
export interface Candidate {
  sourceType: string;
  sourceId: string;
  employeeId: string | null;
  title: string;
  /** "since": pendente desde esta data; "until": acontece nesta data. */
  mode: "since" | "until";
  at: string;
}

export class AlertError extends Error {
  constructor(
    message: string,
    readonly code: "validation" | "not_found" | "invalid_state",
    readonly field: string | null = null,
  ) {
    super(message);
    this.name = "AlertError";
  }
}

const OWNER = /^(admins|profile:[0-9a-f-]{36}|user:[\w@.-]{1,120})$/i;

export function validateRule(r: AlertRuleInput): void {
  if (!ALERT_KINDS.includes(r.kind)) throw new AlertError("Tipo de alerta inválido.", "validation", "kind");
  if (!Number.isInteger(r.thresholdDays) || r.thresholdDays < 0 || r.thresholdDays > 365) throw new AlertError("Dias entre 0 e 365.", "validation", "thresholdDays");
  if (!OWNER.test(r.owner)) throw new AlertError("Indique o dono do alerta.", "validation", "owner");
  if (!Number.isInteger(r.slaHours) || r.slaHours < 1 || r.slaHours > 2160) throw new AlertError("Prazo entre 1 e 2160 horas.", "validation", "slaHours");
  if (r.escalateTo !== null && !OWNER.test(r.escalateTo)) throw new AlertError("Destino do escalonamento inválido.", "validation", "escalateTo");
}

const DAY = 86_400_000;

/** RE-24: pendente há mais de N dias, ou a acontecer dentro de N dias (sem já ter passado). */
export function qualifies(c: Candidate, thresholdDays: number, now: string): boolean {
  const at = Date.parse(c.at.length === 10 ? `${c.at}T00:00:00Z` : c.at);
  const n = Date.parse(now);
  if (c.mode === "since") return n - at >= thresholdDays * DAY;
  return at >= n - DAY && at - n <= thresholdDays * DAY;
}

/** Passou o prazo e ainda não escalou? */
export const needsEscalation = (a: Alert, now: string) => a.status !== "closed" && a.escalatedAt === null && Date.parse(now) > Date.parse(a.dueAt);

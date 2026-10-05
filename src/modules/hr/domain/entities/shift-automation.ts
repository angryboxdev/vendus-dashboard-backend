import { InvalidShiftAutomationError } from "../errors.js";
import type { Weekday } from "./base-schedule-template.js";
import type { ApplicationAudience } from "../services/template-application.service.js";

export type ShiftAutomationStatus = "active" | "paused";

export interface ShiftAutomationDetails {
  name: string;
  description: string | null;
  templateId: string;
  /** Reavaliado em cada geração (task RH 2.0 §7) — mudar de Cargo/Local não altera turnos já gerados. */
  audience: ApplicationAudience;
  /** Local da aplicação (1.º na precedência); null = local padrão do modelo → local principal do colaborador. */
  locationId: string | null;
  weekdays: Weekday[];
  startDate: string;
  /** Fim opcional ("período fixo"). */
  endDate: string | null;
  /** Quantas semanas à frente se mantêm geradas (1–12). */
  horizonWeeks: number;
}

export interface ShiftAutomationProps extends ShiftAutomationDetails {
  id: string;
  kind: "weekly";
  status: ShiftAutomationStatus;
  /** Último dia já gerado — a geração seguinte começa no dia a seguir. */
  generatedUntil: string | null;
  lastRunAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NAME_LENGTH = 80;

const addDays = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const maxDate = (...dates: (string | null)[]) => dates.filter((d): d is string => d !== null).sort().at(-1)!;

function clean(details: ShiftAutomationDetails): ShiftAutomationDetails {
  const name = details.name.trim().replace(/\s+/g, " ");
  if (name.length === 0) throw new InvalidShiftAutomationError("Nome da automatização é obrigatório");
  if (name.length > MAX_NAME_LENGTH) throw new InvalidShiftAutomationError(`Nome: máximo ${MAX_NAME_LENGTH} caracteres`);
  const weekdays = [...new Set(details.weekdays)].sort() as Weekday[];
  if (weekdays.length === 0 || weekdays.some((w) => !Number.isInteger(w) || w < 0 || w > 6)) {
    throw new InvalidShiftAutomationError("Escolha pelo menos um dia da semana");
  }
  if (!DATE.test(details.startDate)) throw new InvalidShiftAutomationError("Data inicial inválida");
  if (details.endDate !== null && (!DATE.test(details.endDate) || details.endDate < details.startDate)) {
    throw new InvalidShiftAutomationError("A data final tem de ser igual ou posterior à inicial");
  }
  if (!Number.isInteger(details.horizonWeeks) || details.horizonWeeks < 1 || details.horizonWeeks > 12) {
    throw new InvalidShiftAutomationError("Horizonte de geração entre 1 e 12 semanas");
  }
  if (details.audience.kind === "employees" && details.audience.employeeIds.length === 0) {
    throw new InvalidShiftAutomationError("Escolha pelo menos um colaborador");
  }
  return { ...details, name, weekdays, description: details.description?.trim() || null };
}

/**
 * Automatização de turnos (RH 2.0 §7): quem + quando + qual Modelo. Gera
 * turnos sempre dentro de um horizonte limitado e só para datas ainda não
 * geradas (`generatedUntil`) — nunca infinitamente nem duas vezes. Alterar
 * ou pausar nunca toca turnos já gerados.
 */
export class ShiftAutomation {
  private constructor(private readonly props: ShiftAutomationProps) {}

  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get status(): ShiftAutomationStatus {
    return this.props.status;
  }
  get templateId(): string {
    return this.props.templateId;
  }

  static create(id: string, details: ShiftAutomationDetails, createdBy: string | null, now: Date): ShiftAutomation {
    const iso = now.toISOString();
    return new ShiftAutomation({
      id,
      kind: "weekly",
      ...clean(details),
      status: "active",
      generatedUntil: null,
      lastRunAt: null,
      createdBy,
      createdAt: iso,
      updatedAt: iso,
    });
  }

  static reconstitute(props: ShiftAutomationProps): ShiftAutomation {
    return new ShiftAutomation({ ...props });
  }

  update(changes: Partial<ShiftAutomationDetails>, now: Date): ShiftAutomation {
    const { id: _i, kind: _k, status: _s, generatedUntil: _g, lastRunAt: _l, createdBy: _c, createdAt: _ca, updatedAt: _u, ...details } = this.props;
    return new ShiftAutomation({ ...this.props, ...clean({ ...details, ...changes }), updatedAt: now.toISOString() });
  }

  setStatus(status: ShiftAutomationStatus, now: Date): ShiftAutomation {
    return new ShiftAutomation({ ...this.props, status, updatedAt: now.toISOString() });
  }

  /**
   * Janela da próxima geração (§7): de max(início, hoje, dia a seguir ao
   * último gerado) até min(fim, hoje + horizonte). `weeks` substitui o
   * horizonte ("Gerar próximas X semanas"). `null` = nada por gerar.
   */
  nextWindow(today: string, weeks?: number): { from: string; to: string } | null {
    const p = this.props;
    const horizon = Math.max(1, Math.min(12, weeks ?? p.horizonWeeks));
    const from = maxDate(p.startDate, today, p.generatedUntil ? addDays(p.generatedUntil, 1) : null);
    const limit = addDays(today, horizon * 7 - 1);
    const to = p.endDate !== null && p.endDate < limit ? p.endDate : limit;
    return from <= to ? { from, to } : null;
  }

  /** Regista uma geração concluída até `until` (inclusive). */
  recordRun(until: string, now: Date): ShiftAutomation {
    const generatedUntil = this.props.generatedUntil && this.props.generatedUntil > until ? this.props.generatedUntil : until;
    return new ShiftAutomation({ ...this.props, generatedUntil, lastRunAt: now.toISOString(), updatedAt: now.toISOString() });
  }

  toProps(): ShiftAutomationProps {
    return { ...this.props, weekdays: [...this.props.weekdays] };
  }
}

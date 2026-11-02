import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { REVIEW_DECISIONS, REVIEW_SCOPES, type DayReview, type ManualTimes, type PlannedRange, type ReviewDecision, type ReviewScope } from "../../domain/entities/day-review.js";
import { applyReview, classifyReview, EXCLUSION_LABEL, isHhmm, manualSeconds, reviewState, type ReviewExclusion, type ReviewFacts, type ReviewState } from "../../domain/services/day-review.js";
import { effectiveEvents, SEGMENT_TYPES, type ClockEvent, type ClockRevision, type RevisionOperation, type SegmentType } from "../../domain/entities/clock.js";
import type { CorrectionRequest, DayVersion, Incident, IncidentStatus } from "../../domain/entities/records.js";
import { AttendanceConflictError, AttendanceForbiddenError, AttendanceNotFoundError, AttendanceValidationError, PunchRefusedError } from "../../domain/errors.js";
import type { AttendanceAuditPort, AttendanceClockPort, AttendanceContextPort, AttendanceRepositoryPort, BackgroundPort, PeriodGuardPort } from "../../domain/ports/out/attendance.ports.js";
import { configHash } from "../../domain/services/config-hash.js";
import { buildSegments, computeDays, dayBoard, type DayPlan, type DayResult, type EngineRules } from "../../domain/services/day-engine.js";
import { clockTypeRefusal, clockTypeRule, validateClockType, type ClockTypeInput } from "../../domain/entities/clock-type.js";
import { breakRefusal, breakRule, validateBreakType, type BreakTypeInput } from "../../domain/entities/break-type.js";
import { checkPunch, distanceMeters, outsideGeofenceMessage, REFUSAL_MESSAGE } from "../../domain/services/punch-policy.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 31;
const EMPTY_PLAN: DayPlan = { theoreticalMinutes: 0, plannedStart: null, plannedEnd: null, nightSchedule: false, excused: false };

const plusDays = (date: string, n: number) => DateTime.fromISO(date, { zone: "utc" }).plus({ days: n }).toISODate()!;
const localDate = (iso: string, tz: string) => DateTime.fromISO(iso, { zone: "utc" }).setZone(tz).toISODate()!;
function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = plusDays(d, 1)) out.push(d);
  return out;
}
const isIso = (v: string | null): v is string => !!v && !Number.isNaN(Date.parse(v)) && /T/.test(v);
const toUtc = (v: string) => new Date(v).toISOString();

export interface Actor {
  userId: string;
  email: string;
}

export interface PunchInput {
  segmentType: SegmentType;
  source: "web" | "pwa";
  clientEventId: string | null;
  locationId: string | null;
  latitude: number | null;
  longitude: number | null;
  ip: string | null;
  /** Hora do dispositivo, para marcações feitas sem rede (fila offline). null = agora. */
  occurredAt?: string | null;
  /** FE-103: tipo de pausa do catálogo (só ao iniciar uma pausa). */
  breakTypeId?: string | null;
  /** FE-105: tipo de registo do catálogo (só ao começar a trabalhar). */
  clockTypeId?: string | null;
}

/** Uma marcação offline só é aceite até este atraso; depois, pedido de correção. */
const OFFLINE_MAX_HOURS = 24;
/** Folga para relógios de dispositivos ligeiramente adiantados. */
const CLOCK_SKEW_SECONDS = 120;

export interface ChangeInput {
  operation: RevisionOperation;
  targetEventId: string | null;
  occurredAt: string | null;
  segmentType: SegmentType | null;
  reason: string;
}

/** Marcação como aparece nas vistas: sem IP nem coordenadas (minimização — RGPD). */
export type EventView = Pick<ClockEvent, "id" | "employeeId" | "occurredAt" | "segmentType" | "source" | "locationId">;
/** Leituras em lote de `boardMany` (todas as pessoas, mesma janela que `load`). */
interface Preloaded {
  events: ClockEvent[];
  revisions: ClockRevision[];
  incidents: Incident[];
  reviews: DayReview[];
}
/** As linhas de uma pessoa, como `load` as teria lido (ordem preservada). */
function fromPreloaded(pre: Preloaded, employeeId: string) {
  const events = pre.events.filter((e) => e.employeeId === employeeId);
  const revisions = pre.revisions.filter((r) => r.employeeId === employeeId);
  return { events, revisions, effective: effectiveEvents(events, revisions) };
}

const view = (e: ClockEvent): EventView => ({ id: e.id, employeeId: e.employeeId, occurredAt: e.occurredAt, segmentType: e.segmentType, source: e.source, locationId: e.locationId });

export interface DayView extends DayResult {
  /** Versão gravada atual (null = ainda não gravado ou dia em curso). */
  version: number | null;
  /** Horário previsto "HH:MM" (fixo) — para as ações rápidas da conferência. */
  plannedStart: string | null;
  plannedEnd: string | null;
}

/** Picagem como a conferência a mostra (hora local; `nextDay` = picagem do dia seguinte que pertence a este turno). */
export interface ConferencePunch {
  at: string;
  kind: "in" | "out" | "break_start" | "break_end";
  nextDay: boolean;
}

/** Um dia na Conferência V2: planeado, picagens, calculado pelo motor e a decisão (ADR-0043). */
export interface ConferenceDay {
  employeeId: string;
  workDate: string;
  phase: ReviewFacts["phase"];
  state: ReviewState;
  closed: boolean;
  plannedRanges: PlannedRange[] | null;
  theoreticalSeconds: number;
  /** Calculado a partir das picagens (antes da decisão). */
  workedSeconds: number;
  /** O que conta nos totais (com a decisão aplicada). */
  validatedSeconds: number;
  restDay: boolean;
  holiday: boolean;
  excused: boolean;
  incomplete: boolean;
  lateMinutes: number;
  punches: ConferencePunch[];
  version: number | null;
  review: Pick<DayReview, "id" | "decision" | "validatedSeconds" | "reason" | "absenceType" | "scope" | "createdBy" | "createdAt"> | null;
}

export interface ConferenceInput {
  decision: ReviewDecision;
  scope: ReviewScope;
  /** `version` = versão gravada que o gestor viu (controlo de concorrência); null = não verificar. */
  items: { employeeId: string; workDate: string; version: number | null }[];
  reason: string;
  /** Declaração "Confirmo que o horário indicado foi efetivamente cumprido" (cumpriu, quando muda horas). */
  declared: boolean;
  manual: ManualTimes | null;
  absenceType: string | null;
}

export interface ConferenceResult {
  batchId: string;
  applied: { employeeId: string; workDate: string; reviewId: string; beforeSeconds: number; validatedSeconds: number | null }[];
  kept: { employeeId: string; workDate: string; reviewId: string }[];
  skipped: { employeeId: string; workDate: string; reason: ReviewExclusion | "out_of_scope"; label: string }[];
}

const MAX_CONFERENCE_ITEMS = 500;
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** Instante UTC de "HH:MM" local numa data (com +N dias). */
const atLocal = (date: string, hhmm: string, tz: string, plus = 0) => DateTime.fromISO(`${date}T${hhmm}`, { zone: tz }).plus({ days: plus }).toUTC().toISO()!;
/** Faixas do planeado: as da escala publicada, senão o início/fim do horário fixo. */
const rangesOf = (plan: DayPlan | undefined): PlannedRange[] | null =>
  plan?.plannedRanges?.length ? plan.plannedRanges : plan?.plannedStart && plan.plannedEnd ? [{ start: plan.plannedStart, end: plan.plannedEnd }] : null;

export class AttendanceUseCases {
  constructor(
    private readonly repo: AttendanceRepositoryPort,
    private readonly ctx: AttendanceContextPort,
    private readonly audit: AttendanceAuditPort,
    private readonly clock: AttendanceClockPort,
    private readonly background: BackgroundPort,
    private readonly periods: PeriodGuardPort = { closedDates: async () => new Set<string>() },
  ) {}

  /** TK-17/RE-30: nenhuma escrita com data num período fechado. */
  private async assertOpen(org: OrganizationId, employeeId: string, dates: string[]) {
    const sorted = [...new Set(dates)].sort();
    if (!sorted.length) return;
    const closed = await this.periods.closedDates(org, employeeId, sorted[0]!, sorted.at(-1)!);
    const hit = sorted.find((d) => closed.has(d));
    if (hit) throw new AttendanceConflictError(`O dia ${hit} está num período fechado. Peça a reabertura do período.`, "period_closed");
  }

  private log(org: OrganizationId, actor: string, action: string, resourceType: string, resourceId: string | null, before: unknown, after: unknown, reason: string | null = null) {
    return this.audit.record(org, { actor, action, resourceType, resourceId, before, after, reason });
  }

  private async employeeOf(org: OrganizationId, userId: string): Promise<string> {
    const id = await this.ctx.employeeForUser(org, userId);
    if (!id) throw new AttendanceNotFoundError("Esta conta não está ligada a uma ficha de colaborador.");
    return id;
  }

  private range(from: string, to: string) {
    if (!DATE.test(from) || !DATE.test(to) || to < from) throw new AttendanceValidationError("Período inválido.", "from");
    if (eachDate(from, to).length > MAX_RANGE_DAYS) throw new AttendanceValidationError(`Máximo de ${MAX_RANGE_DAYS} dias por pedido.`, "to");
  }

  /** Marcações e revisões de um período (datas locais), com 2 dias de folga para jornadas noturnas. */
  private async load(org: OrganizationId, employeeId: string, from: string, to: string, tz: string) {
    const fromUtc = DateTime.fromISO(from, { zone: tz }).minus({ days: 2 }).toUTC().toISO()!;
    const toUtc = DateTime.fromISO(to, { zone: tz }).plus({ days: 2 }).toUTC().toISO()!;
    const [events, revisions] = await Promise.all([this.repo.listEvents(org, employeeId, fromUtc, toUtc), this.repo.listRevisions(org, employeeId, fromUtc, toUtc)]);
    return { events, revisions, effective: effectiveEvents(events, revisions) };
  }

  /**
   * Apuramento (sem gravar) — a única fonte dos totais, para todas as vistas (RE-6).
   * `pre`: marcações, revisões e incidentes já lidos em lote (`boardMany`) —
   * as mesmas linhas que as leituras por pessoa devolveriam.
   */
  private async compute(org: OrganizationId, employeeId: string, from: string, to: string, pre?: Preloaded) {
    const tz = await this.ctx.timeZone(org);
    const now = this.clock.now();
    const [loaded, plans, cfg, incidents, breakTypes, clockTypes, reviews] = await Promise.all([
      pre ? Promise.resolve(fromPreloaded(pre, employeeId)) : this.load(org, employeeId, from, to, tz),
      this.ctx.plans(org, employeeId, plusDays(from, -1), plusDays(to, 1)),
      this.ctx.config(org, employeeId, to, tz),
      pre ? Promise.resolve(pre.incidents.filter((i) => i.employeeId === employeeId)) : this.repo.listIncidents(org, { employeeId, from, to }),
      this.repo.listBreakTypes(org),
      this.repo.listClockTypes(org),
      pre ? Promise.resolve(pre.reviews.filter((r) => r.employeeId === employeeId)) : this.repo.listReviews(org, [employeeId], from, to),
    ]);
    // FE-103: regras do catálogo de pausas (incluindo arquivadas — marcações antigas mantêm-nas).
    if (breakTypes.length) cfg.rules.breakTypes = Object.fromEntries(breakTypes.map((b) => [b.id, breakRule(b)]));
    if (clockTypes.length) cfg.rules.clockTypes = Object.fromEntries(clockTypes.map((c) => [c.id, clockTypeRule(c)]));
    // D8: incidente validado pela gestão → as horas pendentes desse dia contam.
    for (const i of incidents) {
      if (i.status === "resolved_validate") plans.set(i.workDate, { ...(plans.get(i.workDate) ?? EMPTY_PLAN), incidentValidated: true });
    }
    // Conferência V2 (ADR-0043): a decisão ativa do dia entra no resultado do motor — `raw` fica para a conferência.
    const raw = computeDays(loaded.effective, eachDate(from, to), plans, cfg.rules, now);
    const reviewOf = new Map(reviews.map((r) => [r.workDate, r]));
    const days = raw.map((d) => applyReview(d, reviewOf.get(d.workDate)));
    return { tz, now, today: localDate(now, tz), plans, cfg, incidents, raw, days, reviews, ...loaded };
  }

  private sameDay(cur: DayVersion, d: DayResult, hash: string) {
    return (
      cur.configHash === hash &&
      cur.workedSeconds === d.workedSeconds &&
      cur.breakSeconds === d.breakSeconds &&
      cur.nightSeconds === d.nightSeconds &&
      cur.theoreticalSeconds === d.theoreticalSeconds &&
      cur.excessSeconds === d.excessSeconds &&
      cur.pendingSeconds === d.pendingSeconds
    );
  }

  /** Impressão da configuração de um dia; as regras de pausas só entram se o dia as usa (não mexe nos outros dias). */
  private hashFor(c: { cfg: { rules: EngineRules }; plans: Map<string, DayPlan>; days?: DayResult[]; reviews?: DayReview[] }, date: string) {
    const { breakTypes, clockTypes, ...rules } = c.cfg.rules;
    const segs = c.days?.find((d) => d.workDate === date)?.segments ?? [];
    const used = [...new Set(segs.map((s) => s.breakTypeId).filter((x): x is string => !!x))].sort();
    const usedTypes = [...new Set(segs.map((s) => s.clockTypeId).filter((x): x is string => !!x))].sort();
    // Só os campos que já existiam entram no plano: os informativos da conferência não mudam os dias já gravados.
    const { plannedRanges: _r, restDay: _d, holiday: _h, ...plan } = c.plans.get(date) ?? ({} as DayPlan);
    const review = c.reviews?.find((r) => r.workDate === date);
    return configHash({
      rules,
      plan: c.plans.has(date) ? plan : null,
      ...(used.length ? { breaks: used.map((id) => [id, breakTypes?.[id] ?? null]) } : {}),
      ...(usedTypes.length ? { clockTypes: usedTypes.map((id) => [id, clockTypes?.[id] ?? null]) } : {}),
      // Uma decisão de conferência é uma mudança de configuração do dia (versão nova + movimento de ajuste).
      ...(review ? { review: [review.id, review.decision, review.validatedSeconds] } : {}),
    });
  }

  /**
   * Grava o apuramento dos dias fechados (antes de hoje). Um dia só ganha
   * versão nova se os valores ou a configuração mudaram (TK-13); se o
   * excedente mudar, fica um movimento de ajuste — o passado não muda em
   * silêncio. Incidentes novos abrem-se uma vez (RE-14); os que deixaram de
   * existir (ex.: marcação corrigida) fecham-se como resolvidos.
   */
  async recalculate(org: OrganizationId, employeeId: string, from: string, to: string, reason: string): Promise<{ changed: number }> {
    const c = await this.compute(org, employeeId, from, to);
    const current = await this.repo.currentDays(org, employeeId, from, to);
    // Dias de períodos fechados estão congelados (não ganham versões novas nem incidentes).
    const frozen = await this.periods.closedDates(org, employeeId, from, to);
    const found: { employeeId: string; workDate: string; type: DayResult["incidents"][number] }[] = [];
    let changed = 0;
    for (const d of c.days) {
      if (d.workDate >= c.today || frozen.has(d.workDate)) continue;
      for (const type of d.incidents) found.push({ employeeId, workDate: d.workDate, type });
      const hash = this.hashFor(c, d.workDate);
      const cur = current.find((x) => x.workDate === d.workDate);
      if (cur && this.sameDay(cur, d, hash)) continue;
      const v = await this.repo.insertDayVersion(org, {
        employeeId,
        workDate: d.workDate,
        version: (cur?.version ?? 0) + 1,
        workedSeconds: d.workedSeconds,
        breakSeconds: d.breakSeconds,
        nightSeconds: d.nightSeconds,
        theoreticalSeconds: d.theoreticalSeconds,
        excessSeconds: d.excessSeconds,
        pendingSeconds: d.pendingSeconds,
        configHash: hash,
      });
      if (cur && cur.excessSeconds !== d.excessSeconds) {
        await this.repo.insertAdjustment(org, { employeeId, workDate: d.workDate, fromVersion: cur.version, toVersion: v.version, deltaExcessSeconds: d.excessSeconds - cur.excessSeconds, reason });
      }
      changed++;
    }
    if (found.length) await this.repo.ensureIncidents(org, found);
    for (const i of c.incidents) {
      if (i.status !== "open" || i.source !== "engine" || i.workDate >= c.today || frozen.has(i.workDate)) continue;
      if (!found.some((f) => f.workDate === i.workDate && f.type === i.type)) {
        const reviewed = c.reviews.some((r) => r.workDate === i.workDate);
        await this.repo.resolveIncident(org, i.id, { status: "resolved_correct", comment: reviewed ? "Resolvido na conferência." : "Resolvido pela correção das marcações.", resolvedBy: "sistema" });
      }
    }
    return { changed };
  }

  private recalcLater(org: OrganizationId, employeeId: string, from: string, to: string, reason: string) {
    this.background.run(async () => {
      await this.recalculate(org, employeeId, from, to, reason);
    });
  }

  // ── Picar (colaborador) ─────────────────────────────────────────────
  /** RE-9: idempotente por `clientEventId` (fila offline); regras de bloqueio (RE-12, RE-13, CF-11). */
  async punch(org: OrganizationId, actor: Actor, input: PunchInput) {
    if (!SEGMENT_TYPES.includes(input.segmentType)) throw new AttendanceValidationError("Tipo de marcação inválido.", "segmentType");
    if (input.source !== "web" && input.source !== "pwa") throw new AttendanceValidationError("Origem inválida.", "source");
    if (input.clientEventId !== null && (input.clientEventId.length < 1 || input.clientEventId.length > 100)) throw new AttendanceValidationError("Identificador da marcação inválido.", "clientEventId");
    if ((input.latitude === null) !== (input.longitude === null)) throw new AttendanceValidationError("Localização incompleta.", "latitude");
    if (input.latitude !== null && (Math.abs(input.latitude) > 90 || Math.abs(input.longitude!) > 180)) throw new AttendanceValidationError("Localização inválida.", "latitude");
    const employeeId = await this.employeeOf(org, actor.userId);
    if (input.clientEventId) {
      const existing = await this.repo.findEventByClientId(org, employeeId, input.clientEventId);
      if (existing) return { event: view(existing), duplicate: true };
    }
    const tz = await this.ctx.timeZone(org);
    const serverNow = this.clock.now();
    let now = serverNow;
    if (input.occurredAt) {
      if (!isIso(input.occurredAt)) throw new AttendanceValidationError("Data e hora inválidas.", "occurredAt");
      const at = Date.parse(input.occurredAt);
      if (at > Date.parse(serverNow) + CLOCK_SKEW_SECONDS * 1000) throw new AttendanceValidationError("A hora do dispositivo está no futuro.", "occurredAt");
      if (at < Date.parse(serverNow) - OFFLINE_MAX_HOURS * 3600_000) {
        throw new AttendanceValidationError("Esta marcação ficou demasiado tempo sem rede. Envie um pedido de correção.", "occurredAt");
      }
      now = new Date(Math.min(at, Date.parse(serverNow))).toISOString();
    }
    const today = localDate(now, tz);
    await this.assertOpen(org, employeeId, [today]);
    const { effective } = await this.load(org, employeeId, plusDays(today, -1), today, tz);
    const last = effective.filter((e) => e.occurredAt <= now).at(-1);
    const state = last?.segmentType ?? "off";
    if (state === "off" && input.segmentType === "off") throw new AttendanceConflictError("Ainda não tem uma entrada registada.", "same_state");
    // FE-103: pausa com tipo — disponível agora (dia, janela, usos) e remuneração decidida pelo tipo.
    let segmentType = input.segmentType;
    let breakTypeId: string | null = null;
    if (input.breakTypeId) {
      if (input.segmentType !== "break_paid" && input.segmentType !== "break_unpaid") throw new AttendanceValidationError("O tipo de pausa só se indica ao iniciar uma pausa.", "breakTypeId");
      const type = (await this.repo.listBreakTypes(org)).find((b) => b.id === input.breakTypeId);
      if (!type) throw new AttendanceValidationError("Tipo de pausa não encontrado.", "breakTypeId");
      const usesToday = effective.filter((e) => e.breakTypeId === type.id && localDate(e.occurredAt, tz) === today).length;
      const refused = breakRefusal(type, now, tz, usesToday);
      if (refused) throw new AttendanceValidationError(refused, "breakTypeId");
      segmentType = type.remuneration === "unpaid" ? "break_unpaid" : "break_paid";
      breakTypeId = type.id;
    }
    // FE-105: trabalho com tipo de registo — bloqueios e máximo do dia; teletrabalho fica "remoto".
    let clockTypeId: string | null = null;
    if (input.clockTypeId) {
      if (input.segmentType !== "work" && input.segmentType !== "remote") throw new AttendanceValidationError("O tipo de registo só se indica ao começar a trabalhar.", "clockTypeId");
      const type = (await this.repo.listClockTypes(org)).find((c) => c.id === input.clockTypeId);
      if (!type) throw new AttendanceValidationError("Tipo de registo não encontrado.", "clockTypeId");
      const todays = effective.filter((e) => localDate(e.occurredAt, tz) === today && e.occurredAt <= now);
      const used = buildSegments(todays, now)
        .filter((sg) => sg.clockTypeId === type.id)
        .reduce((acc, sg) => acc + Math.max(0, Date.parse(sg.end) - Date.parse(sg.start)) / 1000, 0);
      const refused = clockTypeRefusal(type, now, tz, used);
      if (refused) throw new AttendanceValidationError(refused, "clockTypeId");
      segmentType = type.remote ? "remote" : "work";
      clockTypeId = type.id;
    }
    // Mesmo estado = mesmo tipo de marcação e mesmo tipo de registo/pausa (mudar de "obra" para "Formação" é uma mudança).
    if (state === segmentType && (last?.clockTypeId ?? null) === clockTypeId && (last?.breakTypeId ?? null) === breakTypeId) throw new AttendanceConflictError("Já está neste estado.", "same_state");
    const [cfg, plans, location] = await Promise.all([
      this.ctx.config(org, employeeId, today, tz),
      this.ctx.plans(org, employeeId, today, today),
      this.ctx.punchLocation(org, employeeId, input.locationId),
    ]);
    const refusal = checkPunch(cfg.policy, {
      nowUtc: now,
      timeZone: tz,
      ip: input.ip,
      latitude: input.latitude,
      longitude: input.longitude,
      plannedStart: plans.get(today)?.plannedStart ?? null,
      isEntry: state === "off",
      location,
    });
    if (refusal === "outside_geofence" && location?.latitude != null && location.longitude != null && input.latitude != null && input.longitude != null) {
      // A mesma mensagem do Portal antigo: a que distância está do centro.
      const d = distanceMeters({ latitude: input.latitude, longitude: input.longitude }, { latitude: location.latitude, longitude: location.longitude });
      throw new PunchRefusedError(outsideGeofenceMessage(d), refusal);
    }
    if (refusal) throw new PunchRefusedError(REFUSAL_MESSAGE[refusal], refusal);
    // D7: coordenadas só se a regra as pede (e só no instante da marcação).
    const keepCoords = cfg.policy.requireCoordinates;
    const { event, duplicate } = await this.repo.insertEvent(org, {
      employeeId,
      occurredAt: now,
      segmentType,
      source: input.source,
      clientEventId: input.clientEventId,
      locationId: location?.id ?? null,
      latitude: keepCoords ? input.latitude : null,
      longitude: keepCoords ? input.longitude : null,
      ip: input.ip,
      breakTypeId,
      clockTypeId,
    });
    const serverToday = localDate(serverNow, tz);
    if (today < serverToday) this.recalcLater(org, employeeId, plusDays(today, -1), plusDays(serverToday, -1), "Nova marcação");
    else this.recalcLater(org, employeeId, plusDays(today, -2), plusDays(today, -1), "Nova marcação");
    return { event: view(event), duplicate };
  }

  /** Quem está a trabalhar agora: última marcação das últimas 16 h que não é saída. */
  async presentNow(org: OrganizationId): Promise<{ employeeId: string; state: Exclude<SegmentType, "off">; since: string }[]> {
    const now = this.clock.now();
    const since = new Date(Date.parse(now) - 16 * 3_600_000).toISOString();
    const last = new Map<string, ClockEvent>();
    for (const e of await this.repo.listEventsSince(org, since)) {
      if (e.occurredAt > now) continue;
      const cur = last.get(e.employeeId);
      if (!cur || e.occurredAt >= cur.occurredAt) last.set(e.employeeId, e);
    }
    return [...last.values()].filter((e) => e.segmentType !== "off").map((e) => ({ employeeId: e.employeeId, state: e.segmentType as Exclude<SegmentType, "off">, since: e.occurredAt }));
  }

  /** Estado atual e o dia de hoje (Portal). */
  async myStatus(org: OrganizationId, actor: Actor) {
    const employeeId = await this.employeeOf(org, actor.userId);
    const tz = await this.ctx.timeZone(org);
    const today = localDate(this.clock.now(), tz);
    const c = await this.compute(org, employeeId, today, today);
    const last = c.effective.filter((e) => e.occurredAt <= c.now).at(-1);
    return {
      employeeId,
      timeZone: tz,
      state: last?.segmentType ?? "off",
      since: last?.occurredAt ?? null,
      today: c.days[0]!,
      refusable: await this.repo.listRefusableRevisions(org, employeeId, c.now),
    };
  }


  // ── Vistas (colaborador e gestão) ───────────────────────────────────
  async days(org: OrganizationId, employeeId: string, from: string, to: string) {
    this.range(from, to);
    const c = await this.compute(org, employeeId, from, to);
    const current = await this.repo.currentDays(org, employeeId, from, to);
    const stale = c.days.filter((d) => {
      if (d.workDate >= c.today) return false;
      const cur = current.find((x) => x.workDate === d.workDate);
      return !cur || !this.sameDay(cur, d, this.hashFor(c, d.workDate));
    });
    // A vista mostra sempre o valor atual do motor; o gravado é posto em dia em segundo plano.
    if (stale.length) this.recalcLater(org, employeeId, stale[0]!.workDate, stale.at(-1)!.workDate, "Atualização do apuramento");
    const inRange = (iso: string) => {
      const d = localDate(iso, c.tz);
      return d >= from && d <= to;
    };
    const days: DayView[] = c.days.map((d) => ({
      ...d,
      version: current.find((x) => x.workDate === d.workDate)?.version ?? null,
      plannedStart: c.plans.get(d.workDate)?.plannedStart ?? null,
      plannedEnd: c.plans.get(d.workDate)?.plannedEnd ?? null,
    }));
    return {
      employeeId,
      timeZone: c.tz,
      days,
      totals: {
        workedSeconds: days.reduce((s, d) => s + d.workedSeconds, 0),
        theoreticalSeconds: days.reduce((s, d) => s + d.theoreticalSeconds, 0),
        excessSeconds: days.reduce((s, d) => s + d.excessSeconds, 0),
        pendingSeconds: days.reduce((s, d) => s + d.pendingSeconds, 0),
        nightSeconds: days.reduce((s, d) => s + d.nightSeconds, 0),
      },
      events: c.events.filter((e) => inRange(e.occurredAt)).map(view),
      revisions: c.revisions.filter((r) => inRange(r.anchorAt) || (r.occurredAt !== null && inRange(r.occurredAt))),
      incidents: c.incidents,
      refusable: await this.repo.listRefusableRevisions(org, employeeId, c.now),
    };
  }

  // ── Portal ligado ao Novo RH (Fase 2) ───────────────────────────────
  /**
   * O Novo RH é o único sistema (2026-10-23, interruptor removido). Fica só para o
   * Portal já publicado até o frontend novo chegar; retirar com o RH antigo (fase 5).
   */
  async myPortalMode(org: OrganizationId, actor: Actor): Promise<{ source: "novo_rh" }> {
    await this.employeeOf(org, actor.userId);
    return { source: "novo_rh" };
  }

  /** Painel da gestão: planeado vs. real por dia, da mesma fonte que as vistas (RE-6), sem gravar. */
  async board(org: OrganizationId, employeeId: string, from: string, to: string) {
    this.range(from, to);
    const c = await this.compute(org, employeeId, from, to);
    return { timeZone: c.tz, today: c.today, days: c.days.map((d) => dayBoard(d, c.plans.get(d.workDate), c.cfg.rules, c.now)) };
  }

  /**
   * `board` de vários colaboradores (Visão geral, Dashboard): marcações,
   * revisões e incidentes numa leitura em lote em vez de três por pessoa; o
   * resto do apuramento é o mesmo, por pessoa (`concurrency` em paralelo).
   * Resultado igual a chamar `board` para cada um.
   */
  async boardMany(org: OrganizationId, employeeIds: string[], from: string, to: string, concurrency = 16) {
    this.range(from, to);
    const out = new Map<string, Awaited<ReturnType<AttendanceUseCases["board"]>>>();
    if (!employeeIds.length) return out;
    const tz = await this.ctx.timeZone(org);
    const pre = await this.preload(org, employeeIds, from, to, tz);
    let next = 0;
    const worker = async () => {
      while (next < employeeIds.length) {
        const id = employeeIds[next++]!;
        const c = await this.compute(org, id, from, to, pre);
        out.set(id, { timeZone: c.tz, today: c.today, days: c.days.map((d) => dayBoard(d, c.plans.get(d.workDate), c.cfg.rules, c.now)) });
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, employeeIds.length) }, worker));
    return out;
  }

  /** Leituras em lote (marcações, revisões, incidentes, decisões) com 2 dias de folga para os noturnos. */
  private async preload(org: OrganizationId, employeeIds: string[], from: string, to: string, tz: string): Promise<Preloaded> {
    const fromUtc = DateTime.fromISO(from, { zone: tz }).minus({ days: 2 }).toUTC().toISO()!;
    const toUtc = DateTime.fromISO(to, { zone: tz }).plus({ days: 2 }).toUTC().toISO()!;
    const [events, revisions, incidents, reviews] = await Promise.all([
      this.repo.listEventsMany(org, employeeIds, fromUtc, toUtc),
      this.repo.listRevisionsMany(org, employeeIds, fromUtc, toUtc),
      this.repo.listIncidentsMany(org, employeeIds, from, to),
      this.repo.listReviews(org, employeeIds, from, to),
    ]);
    return { events, revisions, incidents, reviews };
  }

  // ── Conferência V2 (ADR-0043) ───────────────────────────────────────
  /**
   * Fase do dia em relação a agora: pelo planeado (fim depois da meia-noite =
   * dia seguinte); sem planeado, pelo calendário. Um registo aberto mantém o
   * dia "em curso" — nunca se confirma um turno antes de acabar.
   */
  private phaseOf(date: string, plan: DayPlan | undefined, raw: DayResult, now: string, tz: string, today: string): ReviewFacts["phase"] {
    const open = raw.segments.some((s) => s.open && !s.forgotten && !s.autoClosed);
    const ranges = rangesOf(plan);
    if (ranges) {
      const first = ranges[0]!;
      const last = ranges.at(-1)!;
      const crosses = plan?.nightSchedule || toMinutes(last.end) <= toMinutes(first.start) || ranges.some((r) => toMinutes(r.end) <= toMinutes(r.start));
      const start = atLocal(date, first.start, tz);
      const end = atLocal(date, last.end, tz, crosses ? 1 : 0);
      if (now < start && !open) return "future";
      return now < end || open ? "in_progress" : "done";
    }
    if (date > today) return "future";
    if (date === today) return open || (plan?.theoreticalMinutes ?? 0) > 0 ? "in_progress" : "done";
    return open ? "in_progress" : "done";
  }

  /** Picagens de um dia (a partir dos segmentos atribuídos pelo motor), em hora local. */
  private punchesOf(raw: DayResult, tz: string): ConferencePunch[] {
    const out: ConferencePunch[] = [];
    const loc = (iso: string) => {
      const d = DateTime.fromISO(iso, { zone: "utc" }).setZone(tz);
      return { at: d.toFormat("HH:mm"), nextDay: d.toISODate()! > raw.workDate };
    };
    raw.segments.forEach((s, i) => {
      const prev = raw.segments[i - 1];
      const joined = !!prev && prev.end === s.start;
      const isBreak = s.type === "break_paid" || s.type === "break_unpaid";
      out.push({ ...loc(s.start), kind: isBreak ? "break_start" : joined && (prev.type === "break_paid" || prev.type === "break_unpaid") ? "break_end" : "in" });
      const next = raw.segments[i + 1];
      // Saída real: o segmento acaba sem outro a seguir (um aberto ou fechado automaticamente não tem saída).
      if (!s.open && !s.autoClosed && !s.forgotten && !(next && next.start === s.end)) out.push({ ...loc(s.end), kind: "out" });
    });
    return out;
  }

  private factsFor(c: Awaited<ReturnType<AttendanceUseCases["compute"]>>, date: string, closed: Set<string>): ReviewFacts {
    const raw = c.raw.find((d) => d.workDate === date)!;
    const plan = c.plans.get(date);
    return {
      workDate: date,
      phase: this.phaseOf(date, plan, raw, c.now, c.tz, c.today),
      closed: closed.has(date),
      theoreticalSeconds: raw.theoreticalSeconds,
      plannedRanges: rangesOf(plan),
      restDay: !!plan?.restDay,
      holiday: !!plan?.holiday,
      excusedAbsence: !!plan?.excused && !plan?.holiday,
      workedSeconds: raw.workedSeconds,
      hasPunches: raw.segments.length > 0,
      incomplete: raw.incidents.includes("missing_out") || raw.incidents.includes("auto_closed") || raw.segments.some((s) => s.forgotten),
      lateMinutes: dayBoard(raw, plan, c.cfg.rules, c.now).lateMinutes,
      review: c.reviews.find((r) => r.workDate === date) ?? null,
      toleranceMinutes: c.cfg.rules.toleranceMinutes,
    };
  }

  /**
   * Semana (ou período até 31 dias) da equipa visível: por pessoa e dia, o
   * planeado, as picagens, o calculado e a decisão. Mesma fonte que as outras
   * vistas (`compute`); `canSee` aplica o âmbito do gestor.
   */
  async conferenceWeek(org: OrganizationId, from: string, to: string, canSee: (employeeId: string) => Promise<boolean>, locationId: string | null = null) {
    this.range(from, to);
    const all = (await this.ctx.activePeople(org)).filter((p) => !locationId || p.locationId === locationId);
    const visible: typeof all = [];
    for (const p of all) if (await canSee(p.id)) visible.push(p);
    const tz = await this.ctx.timeZone(org);
    const pre = visible.length ? await this.preload(org, visible.map((p) => p.id), from, to, tz) : null;
    const days: ConferenceDay[] = [];
    let today = localDate(this.clock.now(), tz);
    let next = 0;
    const worker = async () => {
      while (next < visible.length) {
        const p = visible[next++]!;
        const [c, closed, current] = await Promise.all([this.compute(org, p.id, from, to, pre!), this.periods.closedDates(org, p.id, from, to), this.repo.currentDays(org, p.id, from, to)]);
        today = c.today;
        for (const d of c.days) {
          const f = this.factsFor(c, d.workDate, closed);
          const review = f.review;
          days.push({
            employeeId: p.id,
            workDate: d.workDate,
            phase: f.phase,
            state: reviewState(f),
            closed: f.closed,
            plannedRanges: f.plannedRanges,
            theoreticalSeconds: f.theoreticalSeconds,
            workedSeconds: f.workedSeconds,
            validatedSeconds: d.workedSeconds,
            restDay: f.restDay,
            holiday: f.holiday,
            excused: f.excusedAbsence,
            incomplete: f.incomplete,
            lateMinutes: f.lateMinutes,
            punches: this.punchesOf(c.raw.find((x) => x.workDate === d.workDate)!, c.tz),
            version: current.find((x) => x.workDate === d.workDate)?.version ?? null,
            review: review
              ? { id: review.id, decision: review.decision, validatedSeconds: review.validatedSeconds, reason: review.reason, absenceType: review.absenceType, scope: review.scope, createdBy: review.createdBy, createdAt: review.createdAt }
              : null,
          });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, visible.length) }, worker));
    return { timeZone: tz, today, from, to, people: visible.map((p) => ({ id: p.id, name: p.name, locationId: p.locationId, locationName: p.locationName })), days };
  }

  private validateConference(input: ConferenceInput) {
    if (!REVIEW_DECISIONS.includes(input.decision)) throw new AttendanceValidationError("Decisão inválida.", "decision");
    if (!REVIEW_SCOPES.includes(input.scope)) throw new AttendanceValidationError("Abrangência inválida.", "scope");
    if (!input.reason?.trim()) throw new AttendanceValidationError("Indique o motivo.", "reason");
    if (input.reason.trim().length > 500) throw new AttendanceValidationError("O motivo tem no máximo 500 caracteres.", "reason");
    if (!input.items.length) throw new AttendanceValidationError("Escolha pelo menos um dia.", "items");
    if (input.items.length > MAX_CONFERENCE_ITEMS) throw new AttendanceValidationError(`No máximo ${MAX_CONFERENCE_ITEMS} dias de uma vez.`, "items");
    if (input.items.some((i) => !i.employeeId || !DATE.test(i.workDate))) throw new AttendanceValidationError("Dia inválido.", "items");
    const dates = input.items.map((i) => i.workDate).sort();
    if (eachDate(dates[0]!, dates.at(-1)!).length > MAX_RANGE_DAYS) throw new AttendanceValidationError(`Máximo de ${MAX_RANGE_DAYS} dias por pedido.`, "items");
    if (new Set(input.items.map((i) => `${i.employeeId}|${i.workDate}`)).size !== input.items.length) throw new AttendanceValidationError("Dias repetidos.", "items");
    if (input.decision === "manual") {
      if (input.items.length !== 1) throw new AttendanceValidationError("A correção manual é feita dia a dia.", "items");
      const m = input.manual;
      if (!m || !isHhmm(m.start) || !isHhmm(m.end)) throw new AttendanceValidationError("Indique a entrada e a saída (HH:MM).", "manual");
      if (!Number.isInteger(m.breakMinutes) || m.breakMinutes < 0 || m.breakMinutes > 600) throw new AttendanceValidationError("Pausa inválida.", "manual");
    }
    if (input.absenceType !== null && (typeof input.absenceType !== "string" || input.absenceType.trim().length > 80)) throw new AttendanceValidationError("Tipo de ausência inválido.", "absenceType");
  }

  /**
   * Aplicar uma decisão de conferência a um ou mais dias (uma confirmação = um
   * lote auditado). O servidor volta a classificar cada dia com as mesmas
   * regras do ecrã: só se gravam os aptos; os já conformes ficam revistos sem
   * mudar horas; o resto volta com o motivo. As picagens e a escala não mudam.
   */
  async applyConference(org: OrganizationId, actor: Actor, input: ConferenceInput, canSee: (employeeId: string, date: string) => Promise<boolean>): Promise<ConferenceResult> {
    this.validateConference(input);
    const batch = input.items.length > 1;
    const batchId = randomUUID();
    const reason = input.reason.trim();
    const self = await this.ctx.employeeForUser(org, actor.userId);
    const result: ConferenceResult = { batchId, applied: [], kept: [], skipped: [] };
    const skip = (i: { employeeId: string; workDate: string }, r: ReviewExclusion | "out_of_scope") =>
      result.skipped.push({ ...i, reason: r, label: r === "out_of_scope" ? "Fora do seu âmbito" : EXCLUSION_LABEL[r] });

    // 1.º passo: classificar tudo (sem gravar) — a declaração e os erros de validação vêm antes de qualquer escrita.
    const byEmployee = new Map<string, ConferenceInput["items"]>();
    for (const i of input.items) byEmployee.set(i.employeeId, [...(byEmployee.get(i.employeeId) ?? []), i]);
    const plan: { employeeId: string; from: string; to: string; writes: { item: ConferenceInput["items"][number]; facts: ReviewFacts; after: number; keep: boolean; version: number | null }[] }[] = [];
    for (const [employeeId, items] of byEmployee) {
      const dates = items.map((i) => i.workDate).sort();
      const from = dates[0]!;
      const to = dates.at(-1)!;
      const writes: (typeof plan)[number]["writes"] = [];
      if (employeeId === self) {
        for (const i of items) skip(i, "self");
        continue;
      }
      const [c, closed, current] = await Promise.all([this.compute(org, employeeId, from, to), this.periods.closedDates(org, employeeId, from, to), this.repo.currentDays(org, employeeId, from, to)]);
      for (const i of items) {
        if (!(await canSee(employeeId, i.workDate))) {
          skip(i, "out_of_scope");
          continue;
        }
        const version = current.find((x) => x.workDate === i.workDate)?.version ?? null;
        if (i.version !== null && i.version !== version) {
          skip(i, "changed");
          continue;
        }
        const facts = this.factsFor(c, i.workDate, closed);
        const cls = classifyReview(facts, input.decision, batch, input.manual);
        if (cls.bucket === "apply") writes.push({ item: i, facts, after: cls.after, keep: false, version });
        else if (cls.bucket === "already" && cls.reason === "already_ok") writes.push({ item: i, facts, after: facts.workedSeconds, keep: true, version });
        else skip(i, cls.reason!);
      }
      plan.push({ employeeId, from, to, writes });
    }
    const changesHours = plan.some((p) => p.writes.some((w) => !w.keep && w.after !== w.facts.workedSeconds));
    if (input.decision === "fulfilled" && changesHours && !input.declared) {
      throw new AttendanceValidationError("Confirme que o horário indicado foi efetivamente cumprido.", "declared");
    }

    // 2.º passo: gravar (uma decisão ativa por dia — se outro gestor gravou entretanto, salta) e recalcular.
    for (const p of plan) {
      let wrote = false;
      for (const w of p.writes) {
        const decision: ReviewDecision = w.keep ? "keep" : input.decision;
        const validatedSeconds = decision === "fulfilled" || decision === "manual" ? w.after : null;
        const saved = await this.repo.insertReview(org, {
          employeeId: p.employeeId,
          workDate: w.item.workDate,
          decision,
          validatedSeconds,
          beforeSeconds: w.facts.workedSeconds,
          theoreticalSeconds: w.facts.theoreticalSeconds,
          plannedRanges: w.facts.plannedRanges,
          manual: decision === "manual" ? input.manual : null,
          absenceType: decision === "absence" ? input.absenceType?.trim() || null : null,
          reason,
          scope: input.scope,
          batchId: batch ? batchId : null,
          dayVersion: w.version,
          createdBy: actor.email,
        });
        if (!saved) {
          skip(w.item, "already_reviewed");
          continue;
        }
        wrote = true;
        if (w.keep) result.kept.push({ employeeId: p.employeeId, workDate: w.item.workDate, reviewId: saved.id });
        else result.applied.push({ employeeId: p.employeeId, workDate: w.item.workDate, reviewId: saved.id, beforeSeconds: w.facts.workedSeconds, validatedSeconds });
      }
      if (wrote) await this.recalculate(org, p.employeeId, p.from, p.to, `Conferência: ${reason}`);
    }
    await this.log(
      org,
      actor.email,
      "attendance.conference.apply",
      "attendance_conference",
      batchId,
      null,
      { decision: input.decision, scope: input.scope, applied: result.applied, kept: result.kept, skipped: result.skipped.map(({ label: _l, ...s }) => s) },
      reason,
    );
    return result;
  }

  /** Anular uma decisão (nunca se apaga): o dia volta ao calculado pelas picagens e pode ser conferido de novo. */
  async voidConferenceReview(org: OrganizationId, actor: Actor, id: string, reason: string, canSee: (employeeId: string, date: string) => Promise<boolean>) {
    if (!reason?.trim()) throw new AttendanceValidationError("Indique o motivo.", "reason");
    const r = await this.repo.getReview(org, id);
    if (!r || !(await canSee(r.employeeId, r.workDate))) throw new AttendanceNotFoundError("Decisão não encontrada.");
    if (r.voidedAt) throw new AttendanceConflictError("Esta decisão já foi anulada.", "already_voided");
    if ((await this.ctx.employeeForUser(org, actor.userId)) === r.employeeId) throw new AttendanceForbiddenError("Não pode conferir o seu próprio registo.", "self_revision");
    await this.assertOpen(org, r.employeeId, [r.workDate]);
    const voided = await this.repo.voidReview(org, id, { voidedBy: actor.email, reason: reason.trim() });
    if (!voided) throw new AttendanceConflictError("Esta decisão já foi anulada.", "already_voided");
    await this.recalculate(org, r.employeeId, r.workDate, r.workDate, `Decisão de conferência anulada: ${reason.trim()}`);
    await this.log(org, actor.email, "attendance.conference.void", "attendance_day_review", id, r, voided, reason.trim());
    return voided;
  }

  // ── Catálogo de pausas (FE-103) ─────────────────────────────────────
  listBreakTypes(org: OrganizationId) {
    return this.repo.listBreakTypes(org);
  }

  private async assertUniqueBreakName(org: OrganizationId, name: string, exceptId: string | null) {
    const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    if ((await this.repo.listBreakTypes(org)).some((b) => !b.archived && b.id !== exceptId && norm(b.name) === norm(name))) throw new AttendanceConflictError("Já existe uma pausa com este nome.", "duplicate_name");
  }

  async createBreakType(org: OrganizationId, actor: Actor, input: BreakTypeInput) {
    validateBreakType(input);
    await this.assertUniqueBreakName(org, input.name, null);
    const b = await this.repo.createBreakType(org, input, actor.email);
    await this.log(org, actor.email, "attendance.break_type.create", "break_type", b.id, null, b, null);
    return b;
  }

  /** Alterar fica auditado com motivo; os dias já apurados que usam a pausa ganham movimento de ajuste (TK-13). */
  async updateBreakType(org: OrganizationId, actor: Actor, id: string, input: BreakTypeInput, expectedVersion: number, reason: string) {
    validateBreakType(input);
    if (reason.trim().length < 5) throw new AttendanceValidationError("Indique o motivo da alteração (mínimo 5 caracteres).", "reason");
    const cur = (await this.repo.listBreakTypes(org)).find((b) => b.id === id);
    if (!cur) throw new AttendanceNotFoundError("Pausa não encontrada.");
    await this.assertUniqueBreakName(org, input.name, id);
    const b = await this.repo.updateBreakType(org, id, input, expectedVersion);
    if (!b) throw new AttendanceConflictError("A pausa foi alterada por outra pessoa. Recarregue.", "stale");
    await this.log(org, actor.email, "attendance.break_type.update", "break_type", id, cur, b, reason.trim());
    return b;
  }

  async archiveBreakType(org: OrganizationId, actor: Actor, id: string) {
    const cur = (await this.repo.listBreakTypes(org)).find((b) => b.id === id);
    if (!cur) throw new AttendanceNotFoundError("Pausa não encontrada.");
    await this.repo.archiveBreakType(org, id);
    await this.log(org, actor.email, "attendance.break_type.archive", "break_type", id, cur, { ...cur, archived: true }, null);
  }

  // ── Tipos de registo (FE-105) ───────────────────────────────────────
  listClockTypes(org: OrganizationId) {
    return this.repo.listClockTypes(org);
  }

  private async assertUniqueClockTypeName(org: OrganizationId, name: string, exceptId: string | null) {
    const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    if ((await this.repo.listClockTypes(org)).some((c) => !c.archived && c.id !== exceptId && norm(c.name) === norm(name))) throw new AttendanceConflictError("Já existe um tipo de registo com este nome.", "duplicate_name");
  }

  async createClockType(org: OrganizationId, actor: Actor, input: ClockTypeInput) {
    validateClockType(input);
    await this.assertUniqueClockTypeName(org, input.name, null);
    const c = await this.repo.createClockType(org, input, actor.email);
    await this.log(org, actor.email, "attendance.clock_type.create", "clock_type", c.id, null, c, null);
    return c;
  }

  async updateClockType(org: OrganizationId, actor: Actor, id: string, input: ClockTypeInput, expectedVersion: number, reason: string) {
    validateClockType(input);
    if (reason.trim().length < 5) throw new AttendanceValidationError("Indique o motivo da alteração (mínimo 5 caracteres).", "reason");
    const cur = (await this.repo.listClockTypes(org)).find((c) => c.id === id);
    if (!cur) throw new AttendanceNotFoundError("Tipo de registo não encontrado.");
    await this.assertUniqueClockTypeName(org, input.name, id);
    const c = await this.repo.updateClockType(org, id, input, expectedVersion);
    if (!c) throw new AttendanceConflictError("O tipo de registo foi alterado por outra pessoa. Recarregue.", "stale");
    await this.log(org, actor.email, "attendance.clock_type.update", "clock_type", id, cur, c, reason.trim());
    return c;
  }

  async archiveClockType(org: OrganizationId, actor: Actor, id: string) {
    const cur = (await this.repo.listClockTypes(org)).find((c) => c.id === id);
    if (!cur) throw new AttendanceNotFoundError("Tipo de registo não encontrado.");
    await this.repo.archiveClockType(org, id);
    await this.log(org, actor.email, "attendance.clock_type.archive", "clock_type", id, cur, { ...cur, archived: true }, null);
  }

  async myDays(org: OrganizationId, actor: Actor, from: string, to: string) {
    return this.days(org, await this.employeeOf(org, actor.userId), from, to);
  }

  /** Dias gravados (versões atuais) — fonte dos totais do fecho (TK-19). */
  storedDays(org: OrganizationId, employeeId: string, from: string, to: string) {
    return this.repo.currentDays(org, employeeId, from, to);
  }

  async adjustments(org: OrganizationId, employeeId: string, from: string, to: string) {
    this.range(from, to);
    return this.repo.listAdjustments(org, employeeId, from, to);
  }

  // ── Revisões da gestão (RE-10, RE-11) ───────────────────────────────
  private validateChange(input: ChangeInput, now: string) {
    if (!input.reason?.trim()) throw new AttendanceValidationError("Indique o motivo da correção.", "reason");
    if (input.reason.trim().length > 500) throw new AttendanceValidationError("O motivo tem no máximo 500 caracteres.", "reason");
    if (!["add", "update", "void"].includes(input.operation)) throw new AttendanceValidationError("Operação inválida.", "operation");
    if (input.segmentType !== null && !SEGMENT_TYPES.includes(input.segmentType)) throw new AttendanceValidationError("Tipo de marcação inválido.", "segmentType");
    if (input.occurredAt !== null && !isIso(input.occurredAt)) throw new AttendanceValidationError("Data e hora inválidas.", "occurredAt");
    if (input.occurredAt !== null && toUtc(input.occurredAt) > now) throw new AttendanceValidationError("Não pode registar uma marcação no futuro.", "occurredAt");
    if (input.operation === "add" && (!input.occurredAt || !input.segmentType)) throw new AttendanceValidationError("Indique a hora e o tipo da marcação.", "occurredAt");
    if (input.operation !== "add" && !input.targetEventId) throw new AttendanceValidationError("Indique a marcação a corrigir.", "targetEventId");
    if (input.operation === "update" && !input.occurredAt && !input.segmentType) throw new AttendanceValidationError("Indique a nova hora ou o novo tipo.", "occurredAt");
  }

  /** Hora atual da marcação alvo (original ou acrescentada por revisão `rev:<id>`). */
  private async targetOf(org: OrganizationId, employeeId: string, targetId: string): Promise<{ occurredAt: string; segmentType: SegmentType }> {
    if (targetId.startsWith("rev:")) {
      const r = await this.repo.getRevision(org, targetId.slice(4));
      if (!r || r.employeeId !== employeeId || r.operation !== "add" || !r.occurredAt || !r.segmentType) throw new AttendanceNotFoundError("Marcação não encontrada.");
      return { occurredAt: r.occurredAt, segmentType: r.segmentType };
    }
    const e = await this.repo.getEvent(org, targetId);
    if (!e || e.employeeId !== employeeId) throw new AttendanceNotFoundError("Marcação não encontrada.");
    return { occurredAt: e.occurredAt, segmentType: e.segmentType };
  }

  private async createRevision(org: OrganizationId, author: string, employeeId: string, input: ChangeInput, refusable: boolean) {
    const target = input.targetEventId ? await this.targetOf(org, employeeId, input.targetEventId) : null;
    const tz = await this.ctx.timeZone(org);
    const now = this.clock.now();
    const occurredAt = input.occurredAt ? toUtc(input.occurredAt) : null;
    const anchorAt = occurredAt ?? target!.occurredAt;
    await this.assertOpen(org, employeeId, [anchorAt, target?.occurredAt].filter((x): x is string => !!x).map((x) => localDate(x, tz)));
    const cfg = await this.ctx.config(org, employeeId, localDate(anchorAt, tz), tz);
    const refusableUntil = refusable && cfg.refusal.enabled ? DateTime.fromISO(now, { zone: "utc" }).plus({ hours: cfg.refusal.hours }).toUTC().toISO()! : null;
    const revision = await this.repo.insertRevision(org, {
      employeeId,
      operation: input.operation,
      targetEventId: input.targetEventId,
      occurredAt,
      segmentType: input.segmentType,
      reason: input.reason.trim(),
      author,
      state: "active",
      refusableUntil,
      anchorAt,
      before: target,
    });
    const touched = [anchorAt, target?.occurredAt].filter((x): x is string => !!x).map((x) => localDate(x, tz)).sort();
    await this.recalculate(org, employeeId, plusDays(touched[0]!, -1), plusDays(touched.at(-1)!, 1), `Correção: ${revision.reason}`);
    return revision;
  }

  async revise(org: OrganizationId, actor: Actor, employeeId: string, input: ChangeInput) {
    this.validateChange(input, this.clock.now());
    // Separação de funções: ninguém corrige o próprio registo.
    if ((await this.ctx.employeeForUser(org, actor.userId)) === employeeId) {
      throw new AttendanceForbiddenError("Não pode corrigir o seu próprio registo. Peça a outra pessoa da gestão.", "self_revision");
    }
    const revision = await this.createRevision(org, actor.email, employeeId, input, true);
    await this.log(org, actor.email, "attendance.revision.create", "clock_revision", revision.id, null, revision, revision.reason);
    return revision;
  }

  /** RE-11: o colaborador recusa uma correção da gestão dentro do prazo. */
  async refuseRevision(org: OrganizationId, actor: Actor, revisionId: string, comment: string | null) {
    const employeeId = await this.employeeOf(org, actor.userId);
    const r = await this.repo.getRevision(org, revisionId);
    if (!r || r.employeeId !== employeeId) throw new AttendanceNotFoundError("Correção não encontrada.");
    if (r.state !== "active" || r.refusableUntil === null) throw new AttendanceConflictError("Esta correção não pode ser recusada.", "not_refusable");
    if (this.clock.now() > r.refusableUntil) throw new AttendanceConflictError("O prazo para recusar esta correção terminou.", "refusal_window_closed");
    await this.assertOpen(org, employeeId, [localDate(r.anchorAt, await this.ctx.timeZone(org))]);
    const updated = await this.repo.refuseRevision(org, revisionId, comment?.trim() || null);
    await this.log(org, actor.email, "attendance.revision.refuse", "clock_revision", revisionId, r, updated, comment);
    const date = localDate(r.anchorAt, await this.ctx.timeZone(org));
    await this.recalculate(org, employeeId, plusDays(date, -1), plusDays(date, 1), "Correção recusada pelo colaborador");
    return updated;
  }

  // ── Pedidos de correção (colaborador → gestão) ──────────────────────
  async requestCorrection(org: OrganizationId, actor: Actor, input: ChangeInput) {
    this.validateChange(input, this.clock.now());
    const employeeId = await this.employeeOf(org, actor.userId);
    if (input.targetEventId) await this.targetOf(org, employeeId, input.targetEventId);
    // FE-113: com fluxo "Correções de ponto", os níveis ficam fixados já (sem quem pede — RE-22).
    const date = input.occurredAt ? input.occurredAt.slice(0, 10) : localDate(this.clock.now(), await this.ctx.timeZone(org));
    const levels = await this.ctx.correctionLevels(org, employeeId, date, [actor.userId]);
    if (levels === "no_approver") throw new AttendanceValidationError("Não há ninguém que possa aprovar este pedido. Configure pessoas de recurso no fluxo de correções de ponto.", "flow");
    const c = await this.repo.insertCorrection(org, {
      employeeId,
      requestedBy: actor.email,
      levels: levels ?? [],
      operation: input.operation,
      targetEventId: input.targetEventId,
      occurredAt: input.occurredAt ? toUtc(input.occurredAt) : null,
      segmentType: input.segmentType,
      reason: input.reason.trim(),
    });
    await this.log(org, actor.email, "attendance.correction.request", "clock_correction_request", c.id, null, c, c.reason);
    return c;
  }

  async myCorrections(org: OrganizationId, actor: Actor) {
    return this.repo.listCorrections(org, { employeeId: await this.employeeOf(org, actor.userId) });
  }

  listCorrections(org: OrganizationId, filter: { status?: CorrectionRequest["status"]; employeeId?: string }) {
    return this.repo.listCorrections(org, filter);
  }

  getCorrection(org: OrganizationId, id: string): Promise<CorrectionRequest | null> {
    return this.repo.getCorrection(org, id);
  }

  async decideCorrection(org: OrganizationId, actor: Actor, id: string, decision: "approve" | "reject", comment: string | null) {
    const c = await this.repo.getCorrection(org, id);
    if (!c) throw new AttendanceNotFoundError("Pedido não encontrado.");
    if (c.status !== "pending") throw new AttendanceConflictError("Este pedido já foi decidido.", "already_decided");
    if ((await this.ctx.employeeForUser(org, actor.userId)) === c.employeeId) throw new AttendanceForbiddenError("Não pode decidir o seu próprio pedido.", "self_approval");
    if (decision === "reject" && !comment?.trim()) throw new AttendanceValidationError("Indique o motivo da recusa.", "comment");
    // FE-113: com níveis, só o nível atual decide; aprovar num nível intermédio passa ao seguinte.
    if (c.levels.length) {
      const level = c.levels[c.currentLevel];
      if (!level?.approvers.includes(actor.userId)) throw new AttendanceForbiddenError("Não é aprovador deste pedido neste nível.", "not_approver");
      if (decision === "approve" && c.currentLevel < c.levels.length - 1) {
        const next = await this.repo.advanceCorrection(org, id, c.currentLevel);
        if (!next) throw new AttendanceConflictError("Este pedido acabou de ser decidido por outra pessoa.", "already_decided");
        await this.log(org, actor.email, "attendance.correction.approve_level", "clock_correction_request", id, c, next, comment);
        return next;
      }
    }
    let revisionId: string | null = null;
    if (decision === "approve") {
      // Pedido do próprio colaborador → a revisão não fica sujeita a recusa.
      const r = await this.createRevision(org, actor.email, c.employeeId, { operation: c.operation, targetEventId: c.targetEventId, occurredAt: c.occurredAt, segmentType: c.segmentType, reason: c.reason }, false);
      revisionId = r.id;
    }
    const decided = await this.repo.decideCorrection(org, id, { status: decision === "approve" ? "approved" : "rejected", decidedBy: actor.email, comment: comment?.trim() || null, revisionId });
    await this.log(org, actor.email, `attendance.correction.${decision}`, "clock_correction_request", id, c, decided, comment);
    return decided;
  }

  // ── Incidentes ──────────────────────────────────────────────────────
  listIncidents(org: OrganizationId, filter: { status?: IncidentStatus; employeeId?: string; from: string; to: string }) {
    if (!DATE.test(filter.from) || !DATE.test(filter.to) || filter.to < filter.from) throw new AttendanceValidationError("Período inválido.", "from");
    return this.repo.listIncidents(org, filter);
  }

  getIncident(org: OrganizationId, id: string): Promise<Incident | null> {
    return this.repo.getIncident(org, id);
  }

  /**
   * Resolver um incidente: `correct` (as marcações foram corrigidas),
   * `validate` (as horas pendentes passam a contar — D8) ou `dismiss`.
   * Validar ou dispensar exige comentário.
   */
  async resolveIncident(org: OrganizationId, actor: Actor, id: string, resolution: "correct" | "validate" | "dismiss", comment: string | null) {
    const i = await this.repo.getIncident(org, id);
    if (!i) throw new AttendanceNotFoundError("Incidente não encontrado.");
    if (i.status !== "open") throw new AttendanceConflictError("Este incidente já foi resolvido.", "already_resolved");
    if (!["correct", "validate", "dismiss"].includes(resolution)) throw new AttendanceValidationError("Resolução inválida.", "resolution");
    if (resolution !== "correct" && !comment?.trim()) throw new AttendanceValidationError("Indique um comentário.", "comment");
    if ((await this.ctx.employeeForUser(org, actor.userId)) === i.employeeId) throw new AttendanceForbiddenError("Não pode resolver um incidente seu.", "self_approval");
    if (resolution === "validate") await this.assertOpen(org, i.employeeId, [i.workDate]);
    const status = resolution === "correct" ? "resolved_correct" : resolution === "validate" ? "resolved_validate" : "dismissed";
    const r = await this.repo.resolveIncident(org, id, { status, comment: comment?.trim() || null, resolvedBy: actor.email });
    await this.log(org, actor.email, `attendance.incident.${resolution}`, "attendance_incident", id, i, r, comment);
    if (status === "resolved_validate") await this.recalculate(org, i.employeeId, i.workDate, i.workDate, "Incidente validado");
    return r;
  }

  // ── Recálculo pedido pela gestão (fila) ─────────────────────────────
  async requestRecalculation(org: OrganizationId, actor: Actor, employeeId: string, from: string, to: string) {
    this.range(from, to);
    await this.repo.enqueue(org, employeeId, eachDate(from, to));
    await this.log(org, actor.email, "attendance.recalculate", "employee", employeeId, null, { from, to });
    this.background.run(() => this.drainQueue(org));
    return { queued: eachDate(from, to).length };
  }

  /** Processa a fila da organização, agrupada por colaborador. */
  async drainQueue(org: OrganizationId): Promise<void> {
    for (;;) {
      const items = await this.repo.takeQueue(org, 200);
      if (!items.length) return;
      const byEmployee = new Map<string, string[]>();
      for (const it of items) byEmployee.set(it.employeeId, [...(byEmployee.get(it.employeeId) ?? []), it.workDate]);
      for (const [employeeId, dates] of byEmployee) {
        dates.sort();
        // Janelas de no máximo MAX_RANGE_DAYS dias seguidos.
        let start = dates[0]!;
        let end = start;
        for (const d of dates.slice(1)) {
          if (d > plusDays(start, MAX_RANGE_DAYS - 1)) {
            await this.recalculate(org, employeeId, start, end, "Recálculo pedido pela gestão");
            start = d;
          }
          end = d;
        }
        await this.recalculate(org, employeeId, start, end, "Recálculo pedido pela gestão");
      }
    }
  }
}

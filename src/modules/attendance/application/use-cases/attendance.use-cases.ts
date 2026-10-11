import { DateTime } from "luxon";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { effectiveEvents, SEGMENT_TYPES, type ClockEvent, type RevisionOperation, type SegmentType } from "../../domain/entities/clock.js";
import type { CorrectionRequest, DayVersion, Incident, IncidentStatus } from "../../domain/entities/records.js";
import { AttendanceConflictError, AttendanceForbiddenError, AttendanceNotFoundError, AttendanceValidationError, PunchRefusedError } from "../../domain/errors.js";
import type { AttendanceAuditPort, AttendanceClockPort, AttendanceContextPort, AttendanceRepositoryPort, BackgroundPort } from "../../domain/ports/out/attendance.ports.js";
import { configHash } from "../../domain/services/config-hash.js";
import { computeDays, type DayPlan, type DayResult } from "../../domain/services/day-engine.js";
import { checkPunch, REFUSAL_MESSAGE } from "../../domain/services/punch-policy.js";

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
}

export interface ChangeInput {
  operation: RevisionOperation;
  targetEventId: string | null;
  occurredAt: string | null;
  segmentType: SegmentType | null;
  reason: string;
}

/** Marcação como aparece nas vistas: sem IP nem coordenadas (minimização — RGPD). */
export type EventView = Pick<ClockEvent, "id" | "employeeId" | "occurredAt" | "segmentType" | "source" | "locationId">;
const view = (e: ClockEvent): EventView => ({ id: e.id, employeeId: e.employeeId, occurredAt: e.occurredAt, segmentType: e.segmentType, source: e.source, locationId: e.locationId });

export interface DayView extends DayResult {
  /** Versão gravada atual (null = ainda não gravado ou dia em curso). */
  version: number | null;
}

export class AttendanceUseCases {
  constructor(
    private readonly repo: AttendanceRepositoryPort,
    private readonly ctx: AttendanceContextPort,
    private readonly audit: AttendanceAuditPort,
    private readonly clock: AttendanceClockPort,
    private readonly background: BackgroundPort,
  ) {}

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

  /** Apuramento (sem gravar) — a única fonte dos totais, para todas as vistas (RE-6). */
  private async compute(org: OrganizationId, employeeId: string, from: string, to: string) {
    const tz = await this.ctx.timeZone(org);
    const now = this.clock.now();
    const [loaded, plans, cfg, incidents] = await Promise.all([
      this.load(org, employeeId, from, to, tz),
      this.ctx.plans(org, employeeId, plusDays(from, -1), plusDays(to, 1)),
      this.ctx.config(org, employeeId, to, tz),
      this.repo.listIncidents(org, { employeeId, from, to }),
    ]);
    // D8: incidente validado pela gestão → as horas pendentes desse dia contam.
    for (const i of incidents) {
      if (i.status === "resolved_validate") plans.set(i.workDate, { ...(plans.get(i.workDate) ?? EMPTY_PLAN), incidentValidated: true });
    }
    const days = computeDays(loaded.effective, eachDate(from, to), plans, cfg.rules, now);
    return { tz, now, today: localDate(now, tz), plans, cfg, incidents, days, ...loaded };
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

  private hashFor(c: { cfg: { rules: unknown }; plans: Map<string, DayPlan> }, date: string) {
    return configHash({ rules: c.cfg.rules, plan: c.plans.get(date) ?? null });
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
    const found: { employeeId: string; workDate: string; type: DayResult["incidents"][number] }[] = [];
    let changed = 0;
    for (const d of c.days) {
      if (d.workDate >= c.today) continue;
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
      if (i.status !== "open" || i.source !== "engine" || i.workDate >= c.today) continue;
      if (!found.some((f) => f.workDate === i.workDate && f.type === i.type)) {
        await this.repo.resolveIncident(org, i.id, { status: "resolved_correct", comment: "Resolvido pela correção das marcações.", resolvedBy: "sistema" });
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
    const now = this.clock.now();
    const today = localDate(now, tz);
    const { effective } = await this.load(org, employeeId, plusDays(today, -1), today, tz);
    const state = effective.filter((e) => e.occurredAt <= now).at(-1)?.segmentType ?? "off";
    if (state === input.segmentType) throw new AttendanceConflictError(state === "off" ? "Ainda não tem uma entrada registada." : "Já está neste estado.", "same_state");
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
    if (refusal) throw new PunchRefusedError(REFUSAL_MESSAGE[refusal], refusal);
    // D7: coordenadas só se a regra as pede (e só no instante da marcação).
    const keepCoords = cfg.policy.requireCoordinates;
    const { event, duplicate } = await this.repo.insertEvent(org, {
      employeeId,
      occurredAt: now,
      segmentType: input.segmentType,
      source: input.source,
      clientEventId: input.clientEventId,
      locationId: location?.id ?? null,
      latitude: keepCoords ? input.latitude : null,
      longitude: keepCoords ? input.longitude : null,
      ip: input.ip,
    });
    this.recalcLater(org, employeeId, plusDays(today, -2), plusDays(today, -1), "Nova marcação");
    return { event: view(event), duplicate };
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
    const days: DayView[] = c.days.map((d) => ({ ...d, version: current.find((x) => x.workDate === d.workDate)?.version ?? null }));
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

  async myDays(org: OrganizationId, actor: Actor, from: string, to: string) {
    return this.days(org, await this.employeeOf(org, actor.userId), from, to);
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
    const c = await this.repo.insertCorrection(org, {
      employeeId,
      requestedBy: actor.email,
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

import { DateTime } from "luxon";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { sameState, stateOf, validateSegments, validateTemplate, type Roster, type RosterShift, type Segment, type ShiftState, type ShiftTemplateInput } from "../../domain/entities/roster.js";
import { RosterBlockedError, RosterConflictError, RosterForbiddenError, RosterNotFoundError, RosterValidationError } from "../../domain/errors.js";
import type { PeriodGuardPort, RosterPublishedPort, RostersAuditPort, RostersContextPort, RostersNotifierPort, RostersRepositoryPort } from "../../domain/ports/out/rosters.ports.js";
import { evaluate, type Violation } from "../../domain/services/constraints.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_VIEW_DAYS = 62;
const MAX_BULK = 2000;
const plusDays = (d: string, n: number) => DateTime.fromISO(d, { zone: "utc" }).plus({ days: n }).toISODate()!;
const span = (a: string, b: string) => Math.round(DateTime.fromISO(b, { zone: "utc" }).diff(DateTime.fromISO(a, { zone: "utc" }), "days").days) + 1;

export interface Actor {
  userId: string;
  email: string;
}

export interface ShiftInput {
  employeeId: string;
  workDate: string;
  kind: "shift" | "day_off";
  templateId: string | null;
  segments: Segment[];
}

/** Estado que conta de um turno, com o rascunho aplicado aos ids indicados. */
const counting = (s: RosterShift, draftIds: Set<string>): ShiftState | null => (draftIds.has(s.id) ? (s.deleted ? null : stateOf(s)) : s.published);

export class RostersUseCases {
  constructor(
    private readonly repo: RostersRepositoryPort,
    private readonly ctx: RostersContextPort,
    private readonly notifier: RostersNotifierPort,
    private readonly hook: RosterPublishedPort,
    private readonly audit: RostersAuditPort,
    private readonly periods: PeriodGuardPort = { closedDates: async () => new Set<string>() },
  ) {}

  private log(org: OrganizationId, actor: string, action: string, resourceType: string, resourceId: string | null, before: unknown, after: unknown, reason: string | null = null) {
    return this.audit.record(org, { actor, action, resourceType, resourceId, before, after, reason });
  }

  // ── Modelos (RE-15) ─────────────────────────────────────────────────
  listTemplates(org: OrganizationId) {
    return this.repo.listTemplates(org);
  }

  async createTemplate(org: OrganizationId, actor: Actor, input: ShiftTemplateInput) {
    validateTemplate(input);
    const lower = input.name.trim().toLocaleLowerCase("pt");
    if ((await this.repo.listTemplates(org)).some((t) => !t.archived && t.name.toLocaleLowerCase("pt") === lower)) throw new RosterConflictError("Já existe um modelo com este nome.", "duplicate_name");
    const t = await this.repo.createTemplate(org, { ...input, name: input.name.trim(), abbreviation: input.abbreviation.trim() }, actor.email);
    await this.log(org, actor.email, "rosters.template.create", "roster_shift_template", t.id, null, t);
    return t;
  }

  async archiveTemplate(org: OrganizationId, actor: Actor, id: string) {
    if (!(await this.repo.listTemplates(org)).some((t) => t.id === id && !t.archived)) throw new RosterNotFoundError("Modelo não encontrado.");
    await this.repo.archiveTemplate(org, id);
    await this.log(org, actor.email, "rosters.template.archive", "roster_shift_template", id, null, null);
  }

  // ── Escalas ─────────────────────────────────────────────────────────
  listRosters(org: OrganizationId) {
    return this.repo.listRosters(org);
  }

  async createRoster(org: OrganizationId, actor: Actor, input: Pick<Roster, "name" | "targetType" | "targetId">) {
    if (!input.name?.trim() || input.name.trim().length > 120) throw new RosterValidationError("O nome é obrigatório (máx. 120).", "name");
    if (input.targetType !== "location" && input.targetType !== "group") throw new RosterValidationError("Indique o centro ou o grupo.", "targetType");
    if (!input.targetId) throw new RosterValidationError("Indique o centro ou o grupo.", "targetId");
    const r = await this.repo.createRoster(org, { ...input, name: input.name.trim() }, actor.email);
    await this.log(org, actor.email, "rosters.roster.create", "roster", r.id, null, r);
    return r;
  }

  async archiveRoster(org: OrganizationId, actor: Actor, id: string) {
    await this.roster(org, id);
    await this.repo.archiveRoster(org, id);
    await this.log(org, actor.email, "rosters.roster.archive", "roster", id, null, null);
  }

  private async roster(org: OrganizationId, id: string) {
    const r = (await this.repo.listRosters(org)).find((x) => x.id === id && !x.archived);
    if (!r) throw new RosterNotFoundError("Escala não encontrada.");
    return r;
  }

  async listShifts(org: OrganizationId, rosterId: string, from: string, to: string) {
    if (!DATE.test(from) || !DATE.test(to) || to < from || span(from, to) > MAX_VIEW_DAYS) throw new RosterValidationError(`Período inválido (máx. ${MAX_VIEW_DAYS} dias).`, "from");
    const r = await this.roster(org, rosterId);
    const shifts = await this.repo.listShifts(org, { rosterId, from, to, includeDeleted: true });
    return { roster: r, pending: shifts.filter((s) => s.dirty).length, shifts: shifts.filter((s) => !s.deleted || s.published !== null) };
  }

  private async segmentsFor(org: OrganizationId, input: ShiftInput): Promise<{ segments: Segment[]; onCall: boolean }> {
    if (input.kind === "day_off") return { segments: [], onCall: false };
    if (input.templateId) {
      const t = (await this.repo.listTemplates(org)).find((x) => x.id === input.templateId && !x.archived);
      if (!t) throw new RosterNotFoundError("Modelo não encontrado.");
      return { segments: t.segments, onCall: t.onCall };
    }
    validateSegments(input.segments);
    return { segments: input.segments, onCall: false };
  }

  /** Avisos de restrições para um conjunto de turnos em rascunho (pré-visualização). */
  private async violationsFor(org: OrganizationId, draftIds: Set<string>, extraDrafts: RosterShift[] = []): Promise<Violation[]> {
    const touched = [...extraDrafts];
    if (draftIds.size) {
      for (const id of draftIds) {
        if (touched.some((t) => t.id === id)) continue;
        const s = await this.repo.getShift(org, id);
        if (s) touched.push(s);
      }
    }
    if (!touched.length) return [];
    const employees = [...new Set(touched.flatMap((s) => [s.employeeId, s.published?.employeeId].filter((x): x is string => !!x)))];
    const years = [...new Set(touched.map((s) => s.workDate.slice(0, 4)))].sort();
    const from = `${years[0]}-01-01`;
    const to = `${years.at(-1)}-12-31`;
    const all = await this.repo.listShifts(org, { employeeIds: employees, from, to, includeDeleted: true });
    const byId = new Map(all.map((s) => [s.id, s]));
    for (const t of touched) byId.set(t.id, t);
    const states = [...byId.values()].map((s) => counting(s, draftIds)).filter((x): x is ShiftState => !!x);
    const absences = new Map<string, Set<string>>();
    for (const e of employees) absences.set(e, new Set(await this.ctx.approvedAbsenceDates(org, e, from, to)));
    const focus = new Set(touched.flatMap((s) => [`${s.employeeId}|${s.workDate}`, ...(s.published ? [`${s.published.employeeId}|${s.published.workDate}`] : [])]));
    return evaluate(states, await this.ctx.rules(org, touched[0]!.employeeId, touched[0]!.workDate), absences, focus);
  }

  async addShift(org: OrganizationId, actor: Actor, rosterId: string, input: ShiftInput) {
    await this.roster(org, rosterId);
    if (!DATE.test(input.workDate)) throw new RosterValidationError("Data inválida.", "workDate");
    if (!input.employeeId) throw new RosterValidationError("Indique o colaborador.", "employeeId");
    const seg = await this.segmentsFor(org, input);
    const [s] = await this.repo.insertShifts(org, [{ rosterId, employeeId: input.employeeId, workDate: input.workDate, kind: input.kind, segments: seg.segments, templateId: input.templateId, onCall: seg.onCall }], actor.email);
    return { shift: s!, warnings: await this.violationsFor(org, new Set([s!.id])) };
  }

  /** Atribuição em massa: colaboradores × dias (com filtro de dias da semana). */
  async assignBulk(org: OrganizationId, actor: Actor, rosterId: string, input: { employeeIds: string[]; from: string; to: string; weekdays: string[]; kind: "shift" | "day_off"; templateId: string | null }) {
    await this.roster(org, rosterId);
    if (!DATE.test(input.from) || !DATE.test(input.to) || input.to < input.from || span(input.from, input.to) > MAX_VIEW_DAYS) throw new RosterValidationError(`Período inválido (máx. ${MAX_VIEW_DAYS} dias).`, "from");
    if (!input.employeeIds.length) throw new RosterValidationError("Escolha pelo menos um colaborador.", "employeeIds");
    if (input.kind === "shift" && !input.templateId) throw new RosterValidationError("Escolha o modelo de turno.", "templateId");
    const seg = await this.segmentsFor(org, { employeeId: "", workDate: input.from, kind: input.kind, templateId: input.templateId, segments: [] });
    const dates: string[] = [];
    for (let d = input.from; d <= input.to; d = plusDays(d, 1)) if (!input.weekdays.length || input.weekdays.includes(String(DateTime.fromISO(d, { zone: "utc" }).weekday))) dates.push(d);
    const rows = input.employeeIds.flatMap((employeeId) => dates.map((workDate) => ({ rosterId, employeeId, workDate, kind: input.kind, segments: seg.segments, templateId: input.templateId, onCall: seg.onCall })));
    if (rows.length > MAX_BULK) throw new RosterValidationError(`No máximo ${MAX_BULK} turnos de uma vez.`, "employeeIds");
    const created = await this.repo.insertShifts(org, rows, actor.email);
    await this.log(org, actor.email, "rosters.shift.bulk", "roster", rosterId, null, { count: created.length, ...input });
    return { created: created.length, warnings: await this.violationsFor(org, new Set(created.map((c) => c.id)), created) };
  }

  /**
   * Alterar um turno. Em rascunho: muda e fica por publicar. Já publicado
   * (TK-16): exige motivo e publica de imediato como versão nova, com aviso
   * ao colaborador.
   */
  async updateShift(org: OrganizationId, actor: Actor, id: string, input: Partial<ShiftInput>, opts: { reason: string | null; confirm: boolean }) {
    const cur = await this.repo.getShift(org, id);
    if (!cur || (cur.deleted && cur.published === null)) throw new RosterNotFoundError("Turno não encontrado.");
    if (cur.published && !opts.reason?.trim()) throw new RosterValidationError("Indique o motivo da alteração de um turno publicado.", "reason");
    const merged: ShiftInput = {
      employeeId: input.employeeId ?? cur.employeeId,
      workDate: cur.workDate,
      kind: input.kind ?? cur.kind,
      templateId: input.templateId !== undefined ? input.templateId : cur.templateId,
      segments: input.segments ?? cur.segments,
    };
    const seg = input.kind || input.templateId !== undefined || input.segments ? await this.segmentsFor(org, merged) : { segments: cur.segments, onCall: cur.onCall };
    const draft: RosterShift = { ...cur, employeeId: merged.employeeId, kind: merged.kind, templateId: merged.templateId, segments: seg.segments, onCall: seg.onCall, deleted: false, dirty: true };
    if (cur.published) return this.publishNow(org, actor, cur, draft, opts.reason!.trim(), opts.confirm);
    const saved = await this.repo.updateShift(org, id, { employeeId: draft.employeeId, kind: draft.kind, templateId: draft.templateId, segments: draft.segments, onCall: draft.onCall, deleted: false, dirty: true }, actor.email);
    return { shift: saved, warnings: await this.violationsFor(org, new Set([id])), publication: null };
  }

  async deleteShift(org: OrganizationId, actor: Actor, id: string, opts: { reason: string | null; confirm: boolean }) {
    const cur = await this.repo.getShift(org, id);
    if (!cur || (cur.deleted && cur.published === null)) throw new RosterNotFoundError("Turno não encontrado.");
    if (!cur.published) {
      const saved = await this.repo.updateShift(org, id, { deleted: true, dirty: false }, actor.email);
      return { shift: saved, warnings: [], publication: null };
    }
    if (!opts.reason?.trim()) throw new RosterValidationError("Indique o motivo para retirar um turno publicado.", "reason");
    return this.publishNow(org, actor, cur, { ...cur, deleted: true, dirty: true }, opts.reason.trim(), opts.confirm);
  }

  /** Publica só este turno (alteração pós-publicação — TK-16). */
  private async publishNow(org: OrganizationId, actor: Actor, cur: RosterShift, draft: RosterShift, reason: string, confirm: boolean) {
    const warnings = await this.checkOrThrow(org, new Set([cur.id]), [draft], confirm);
    const roster = await this.roster(org, cur.rosterId);
    const version = await this.nextVersion(org, roster);
    const after = draft.deleted ? null : stateOf(draft);
    const saved = await this.repo.updateShift(
      org,
      cur.id,
      { employeeId: draft.employeeId, kind: draft.kind, templateId: draft.templateId, segments: draft.segments, onCall: draft.onCall, deleted: draft.deleted, dirty: false, published: after, publishedVersion: version },
      actor.email,
    );
    const publication = await this.repo.insertPublication(org, {
      rosterId: roster.id,
      version,
      reason,
      confirmedWarnings: warnings,
      changes: [{ shiftId: cur.id, employeeId: draft.employeeId, before: cur.published, after }],
      publishedBy: actor.email,
    });
    await this.afterPublish(org, roster, publication.changes, `Turno alterado: ${reason}`);
    await this.log(org, actor.email, "rosters.shift.change_published", "roster_shift", cur.id, cur.published, after, reason);
    return { shift: saved, warnings, publication };
  }

  private async checkOrThrow(org: OrganizationId, draftIds: Set<string>, drafts: RosterShift[], confirm: boolean): Promise<Violation[]> {
    // TK-17: não se publicam (nem retiram) turnos em dias de períodos fechados.
    for (const d of drafts) {
      for (const s of [d, d.published].filter((x): x is NonNullable<typeof x> => !!x)) {
        if ((await this.periods.closedDates(org, s.employeeId, s.workDate, s.workDate)).has(s.workDate)) {
          throw new RosterConflictError(`O dia ${s.workDate} está num período fechado. Peça a reabertura do período.`, "period_closed");
        }
      }
    }
    const violations = await this.violationsFor(org, draftIds, drafts);
    const blocking = violations.filter((v) => v.severity === "block");
    if (blocking.length) throw new RosterBlockedError(blocking);
    if (violations.length && !confirm) throw new RosterConflictError("Há avisos de restrições. Confirme para publicar.", "confirmation_required", violations);
    return violations;
  }

  private async nextVersion(org: OrganizationId, roster: Roster): Promise<number> {
    if (!(await this.repo.bumpVersion(org, roster.id, roster.version))) throw new RosterConflictError("A escala acabou de ser publicada por outra pessoa. Atualize e tente de novo.", "invalid_state");
    return roster.version + 1;
  }

  private async afterPublish(org: OrganizationId, roster: Roster, changes: { employeeId: string; before: ShiftState | null; after: ShiftState | null }[], title: string) {
    const employees = [...new Set(changes.flatMap((c) => [c.employeeId, c.before?.employeeId].filter((x): x is string => !!x)))];
    const users = (await Promise.all(employees.map((e) => this.ctx.userOfEmployee(org, e)))).filter((u): u is string => !!u);
    if (users.length) {
      await this.notifier.notify(org, users, { title, body: `A escala "${roster.name}" foi atualizada. Veja os seus turnos.`, link: "/hr/novo/escalas", dedupeKey: `roster:${roster.id}:${roster.version + 1}` });
    }
    this.hook.published(
      org,
      changes.flatMap((c) => [c.before, c.after].filter((x): x is ShiftState => !!x).map((s) => ({ employeeId: s.employeeId, workDate: s.workDate }))),
    );
  }

  /** Pré-visualização das restrições do que está por publicar. */
  async check(org: OrganizationId, rosterId: string) {
    await this.roster(org, rosterId);
    const dirty = (await this.repo.listShifts(org, { rosterId, from: "1900-01-01", to: "2999-12-31", includeDeleted: true })).filter((s) => s.dirty);
    return { pending: dirty.length, violations: await this.violationsFor(org, new Set(dirty.map((d) => d.id)), dirty) };
  }

  /** RE-17: publicar cria uma versão (histórico) e avisa os colaboradores afetados. */
  async publish(org: OrganizationId, actor: Actor, rosterId: string, opts: { reason: string | null; confirm: boolean }) {
    const roster = await this.roster(org, rosterId);
    const dirty = (await this.repo.listShifts(org, { rosterId, from: "1900-01-01", to: "2999-12-31", includeDeleted: true })).filter((s) => s.dirty);
    const changes = dirty.map((s) => ({ shift: s, before: s.published, after: s.deleted ? null : stateOf(s) })).filter((c) => !sameState(c.before, c.after));
    if (!changes.length) throw new RosterConflictError("Não há alterações por publicar.", "nothing_to_publish");
    const warnings = await this.checkOrThrow(org, new Set(dirty.map((d) => d.id)), dirty, opts.confirm);
    const version = await this.nextVersion(org, roster);
    for (const s of dirty) await this.repo.updateShift(org, s.id, { dirty: false, published: s.deleted ? null : stateOf(s), publishedVersion: version }, actor.email);
    const publication = await this.repo.insertPublication(org, {
      rosterId,
      version,
      reason: opts.reason?.trim() || null,
      confirmedWarnings: warnings,
      changes: changes.map((c) => ({ shiftId: c.shift.id, employeeId: c.after?.employeeId ?? c.before!.employeeId, before: c.before, after: c.after })),
      publishedBy: actor.email,
    });
    await this.afterPublish(org, roster, publication.changes, "Escala publicada");
    await this.log(org, actor.email, "rosters.publish", "roster", rosterId, null, { version, changes: publication.changes.length, warnings: warnings.length }, opts.reason);
    return publication;
  }

  async history(org: OrganizationId, rosterId: string) {
    await this.roster(org, rosterId);
    return (await this.repo.listPublications(org, rosterId)).sort((a, b) => b.version - a.version);
  }

  // ── Planeado para o tempo teórico ───────────────────────────────────
  /** Turnos publicados de um colaborador: por dia, minutos, faixas, noturno, folga. */
  async plannedFor(org: OrganizationId, employeeId: string, from: string, to: string) {
    const shifts = await this.repo.listShifts(org, { employeeIds: [employeeId], from, to, includeDeleted: true });
    const out = new Map<string, { minutes: number; segments: Segment[]; night: boolean; dayOff: boolean }>();
    for (const s of shifts) {
      const p = s.published;
      if (!p || p.employeeId !== employeeId) continue;
      const cur = out.get(p.workDate) ?? { minutes: 0, segments: [], night: false, dayOff: true };
      if (p.kind === "shift") {
        cur.dayOff = false;
        cur.segments = [...cur.segments, ...p.segments].sort((a, b) => a.start.localeCompare(b.start));
        cur.night = cur.night || p.segments.some((x) => x.end <= x.start);
        cur.minutes = cur.segments.reduce((acc, x) => {
          const a = Number(x.start.slice(0, 2)) * 60 + Number(x.start.slice(3));
          const b = Number(x.end.slice(0, 2)) * 60 + Number(x.end.slice(3));
          return acc + (b > a ? b - a : 1440 - a + b);
        }, 0);
      }
      out.set(p.workDate, cur);
    }
    // Turnos publicados que entretanto passaram para outra pessoa (troca) não contam aqui.
    return out;
  }

  async myRoster(org: OrganizationId, actor: Actor, from: string, to: string) {
    if (!DATE.test(from) || !DATE.test(to) || to < from || span(from, to) > MAX_VIEW_DAYS) throw new RosterValidationError(`Período inválido (máx. ${MAX_VIEW_DAYS} dias).`, "from");
    const employeeId = await this.ctx.employeeForUser(org, actor.userId);
    if (!employeeId) throw new RosterNotFoundError("Esta conta não está ligada a uma ficha de colaborador.");
    const shifts = await this.repo.listShifts(org, { employeeIds: [employeeId], from, to, includeDeleted: true });
    return { employeeId, shifts: shifts.filter((s) => s.published?.employeeId === employeeId).map((s) => ({ id: s.id, rosterId: s.rosterId, ...s.published! })) };
  }

  // ── Trocas (colega aceita, gestão aprova) ───────────────────────────
  async requestSwap(org: OrganizationId, actor: Actor, input: { shiftId: string; targetEmployeeId: string; counterShiftId: string | null; comment: string | null }) {
    const me = await this.ctx.employeeForUser(org, actor.userId);
    if (!me) throw new RosterNotFoundError("Esta conta não está ligada a uma ficha de colaborador.");
    const shift = await this.repo.getShift(org, input.shiftId);
    if (!shift?.published || shift.published.employeeId !== me) throw new RosterNotFoundError("Turno não encontrado.");
    if (input.targetEmployeeId === me) throw new RosterValidationError("Escolha outro colega.", "targetEmployeeId");
    if (input.counterShiftId) {
      const counter = await this.repo.getShift(org, input.counterShiftId);
      if (!counter?.published || counter.published.employeeId !== input.targetEmployeeId) throw new RosterNotFoundError("Turno do colega não encontrado.");
    }
    const s = await this.repo.insertSwap(org, { shiftId: input.shiftId, counterShiftId: input.counterShiftId, requesterEmployeeId: me, targetEmployeeId: input.targetEmployeeId, comment: input.comment?.trim() || null });
    const target = await this.ctx.userOfEmployee(org, input.targetEmployeeId);
    if (target) await this.notifier.notify(org, [target], { title: "Pedido de troca de turno", body: `Um colega propõe trocar o turno de ${shift.published.workDate}.`, link: "/hr/novo/escalas", dedupeKey: `swap:${s.id}` });
    await this.log(org, actor.email, "rosters.swap.request", "roster_swap", s.id, null, s);
    return s;
  }

  async respondSwap(org: OrganizationId, actor: Actor, id: string, accept: boolean) {
    const swap = await this.repo.getSwap(org, id);
    if (!swap) throw new RosterNotFoundError("Pedido de troca não encontrado.");
    if ((await this.ctx.employeeForUser(org, actor.userId)) !== swap.targetEmployeeId) throw new RosterForbiddenError("Só o colega convidado pode responder.");
    const updated = await this.repo.updateSwap(org, id, "pending_target", { status: accept ? "pending_manager" : "rejected" });
    if (!updated) throw new RosterConflictError("Este pedido já não está à espera de resposta.", "invalid_state");
    await this.log(org, actor.email, `rosters.swap.${accept ? "accept" : "decline"}`, "roster_swap", id, swap, updated);
    return updated;
  }

  listSwaps(org: OrganizationId, status?: "pending_target" | "pending_manager" | "approved" | "rejected" | "cancelled") {
    return this.repo.listSwaps(org, status ? { status } : {});
  }

  async mySwaps(org: OrganizationId, actor: Actor) {
    const me = await this.ctx.employeeForUser(org, actor.userId);
    if (!me) throw new RosterNotFoundError("Esta conta não está ligada a uma ficha de colaborador.");
    return this.repo.listSwaps(org, { employeeId: me });
  }

  /** A gestão aprova (troca publicada de imediato, com restrições) ou recusa. Ninguém envolvido decide. */
  async decideSwap(org: OrganizationId, actor: Actor, id: string, approve: boolean, comment: string | null, confirm: boolean) {
    const swap = await this.repo.getSwap(org, id);
    if (!swap) throw new RosterNotFoundError("Pedido de troca não encontrado.");
    if (swap.status !== "pending_manager") throw new RosterConflictError("Este pedido não está à espera da gestão.", "invalid_state");
    const me = await this.ctx.employeeForUser(org, actor.userId);
    if (me === swap.requesterEmployeeId || me === swap.targetEmployeeId) throw new RosterForbiddenError("Não pode decidir uma troca em que participa.");
    if (!approve) {
      if (!comment?.trim()) throw new RosterValidationError("Indique o motivo da recusa.", "comment");
      const updated = await this.repo.updateSwap(org, id, "pending_manager", { status: "rejected", decidedBy: actor.email, comment: comment.trim() });
      await this.log(org, actor.email, "rosters.swap.reject", "roster_swap", id, swap, updated, comment);
      return updated;
    }
    const a = await this.repo.getShift(org, swap.shiftId);
    const b = swap.counterShiftId ? await this.repo.getShift(org, swap.counterShiftId) : null;
    if (!a?.published || a.published.employeeId !== swap.requesterEmployeeId || (swap.counterShiftId && (!b?.published || b.published.employeeId !== swap.targetEmployeeId))) {
      throw new RosterConflictError("Os turnos mudaram desde o pedido.", "invalid_state");
    }
    const drafts = [{ ...a, employeeId: swap.targetEmployeeId, dirty: true, deleted: false }, ...(b ? [{ ...b, employeeId: swap.requesterEmployeeId, dirty: true, deleted: false }] : [])];
    const warnings = await this.checkOrThrow(org, new Set(drafts.map((d) => d.id)), drafts, confirm);
    const roster = await this.roster(org, a.rosterId);
    const version = await this.nextVersion(org, roster);
    const changes = [];
    for (const d of drafts) {
      const after = stateOf(d);
      await this.repo.updateShift(org, d.id, { employeeId: d.employeeId, dirty: false, published: after, publishedVersion: version }, actor.email);
      changes.push({ shiftId: d.id, employeeId: d.employeeId, before: d.published, after });
    }
    const publication = await this.repo.insertPublication(org, { rosterId: roster.id, version, reason: "Troca de turno aprovada", confirmedWarnings: warnings, changes, publishedBy: actor.email });
    const updated = await this.repo.updateSwap(org, id, "pending_manager", { status: "approved", decidedBy: actor.email, comment: comment?.trim() || null });
    await this.afterPublish(org, roster, publication.changes, "Troca de turno aprovada");
    await this.log(org, actor.email, "rosters.swap.approve", "roster_swap", id, swap, updated, comment);
    return updated;
  }
}

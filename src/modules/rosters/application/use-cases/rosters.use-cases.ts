import { DateTime } from "luxon";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { sameState, stateOf, validateAreaName, validateSegments, validateTemplate, type Roster, type RosterShift, type Segment, type ShiftState, type ShiftTemplate, type ShiftTemplateInput, type ShiftTemplateView } from "../../domain/entities/roster.js";
import { RosterBlockedError, RosterConflictError, RosterForbiddenError, RosterNotFoundError, RosterValidationError } from "../../domain/errors.js";
import type { PeriodGuardPort, RosterPublishedPort, RostersAuditPort, RostersContextPort, RostersNotifierPort, RostersRepositoryPort } from "../../domain/ports/out/rosters.ports.js";
import { evaluate, findOverlap, shiftHours, type CountedShift, type Violation } from "../../domain/services/constraints.js";
import { coworkerShortName, hoursLabel, shiftsOverlap } from "../../domain/services/coworkers.service.js";

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
  /** Área de trabalho (opcional; numa folga nunca há área). */
  areaId?: string | null;
}

/** Estado que conta de um turno, com o rascunho aplicado aos ids indicados (e a identidade, para localizar conflitos). */
const counting = (s: RosterShift, draftIds: Set<string>): CountedShift | null => {
  const draft = draftIds.has(s.id);
  const state = draft ? (s.deleted ? null : stateOf(s)) : s.published;
  return state ? { ...state, id: s.id, rosterId: s.rosterId, published: !draft || (!s.dirty && s.published !== null) } : null;
};

/** Turno planeado (rascunho ou publicado), com a identidade e o estado de publicação. */
const planned = (s: RosterShift): CountedShift => ({ ...stateOf(s), id: s.id, rosterId: s.rosterId, published: !s.dirty && s.published !== null });

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

  /** Gestão dos modelos: os ativos e arquivados, cada um com `used` (já atribuído alguma vez). */
  async listTemplatesWithUsage(org: OrganizationId): Promise<ShiftTemplateView[]> {
    const all = await this.repo.listTemplates(org);
    const used = await this.repo.usedTemplateIds(org, all.filter((t) => !t.archived).map((t) => t.id));
    return all.map((t) => ({ ...t, used: used.has(t.id) }));
  }

  /**
   * Editar um modelo. Nunca usado → altera-o no lugar. Já usado → nova versão:
   * arquiva este e cria outro com as alterações. Os turnos já feitos (rascunho
   * ou publicados) continuam no modelo antigo — horário, nome e cor de antes;
   * só as atribuições novas usam o novo (decisão do utilizador).
   */
  async updateTemplate(org: OrganizationId, actor: Actor, id: string, input: ShiftTemplateInput): Promise<{ template: ShiftTemplate; versioned: boolean }> {
    validateTemplate(input);
    const all = await this.repo.listTemplates(org);
    const before = all.find((t) => t.id === id && !t.archived);
    if (!before) throw new RosterNotFoundError("Modelo não encontrado.");
    const next = { ...input, name: input.name.trim(), abbreviation: input.abbreviation.trim() };
    const lower = next.name.toLocaleLowerCase("pt");
    if (all.some((t) => t.id !== id && !t.archived && t.name.toLocaleLowerCase("pt") === lower)) throw new RosterConflictError("Já existe um modelo com este nome.", "duplicate_name");
    const { archived: _a, id: _i, ...beforeInput } = before;

    if (!(await this.repo.usedTemplateIds(org, [id])).has(id)) {
      const after = await this.repo.updateTemplate(org, id, next);
      // Uma atribuição pode ter entrado entre a verificação e a gravação: desfaz e pede para repetir.
      if ((await this.repo.usedTemplateIds(org, [id])).has(id)) {
        await this.repo.updateTemplate(org, id, beforeInput);
        throw new RosterConflictError("Este turno acabou de ser usado numa escala. Guarda outra vez para criar uma nova versão.", "template_in_use");
      }
      await this.log(org, actor.email, "rosters.template.update", "roster_shift_template", id, before, after);
      return { template: after, versioned: false };
    }

    await this.repo.archiveTemplate(org, id);
    let created: ShiftTemplate;
    try {
      created = await this.repo.createTemplate(org, next, actor.email);
    } catch (e) {
      await this.repo.unarchiveTemplate(org, id);
      throw e;
    }
    await this.log(org, actor.email, "rosters.template.version", "roster_shift_template", created.id, { previousId: id, ...before }, created);
    return { template: created, versioned: true };
  }

  /** Muda só a cor do modelo (a escala pinta os turnos com ela); null = cor automática. Num modelo já usado, recusa — mudar a cor passa por editar (nova versão). */
  async setTemplateColor(org: OrganizationId, actor: Actor, id: string, color: string | null) {
    const before = (await this.repo.listTemplates(org)).find((t) => t.id === id && !t.archived);
    if (!before) throw new RosterNotFoundError("Modelo não encontrado.");
    if ((await this.repo.usedTemplateIds(org, [id])).has(id)) throw new RosterConflictError("Cor bloqueada: turno já utilizado numa escala.", "template_in_use");
    validateTemplate({ ...before, color });
    const after = await this.repo.setTemplateColor(org, id, color);
    await this.log(org, actor.email, "rosters.template.color", "roster_shift_template", id, { color: before.color }, { color });
    return after;
  }

  // ── Áreas de trabalho (por centro; sempre disponíveis) ───────────────
  /** Áreas (com `locationId`: só as desse centro). Inclui desativadas, para os turnos antigos. */
  async listAreas(org: OrganizationId, locationId?: string | null) {
    const all = await this.repo.listAreas(org);
    return locationId ? all.filter((a) => a.locationId === locationId) : all;
  }

  async createArea(org: OrganizationId, actor: Actor, input: { locationId: string; name: string }) {
    if (!input.locationId) throw new RosterValidationError("Escolha o centro.", "locationId");
    const name = validateAreaName(input.name);
    const same = (await this.repo.listAreas(org)).filter((a) => a.locationId === input.locationId);
    if (same.some((a) => a.active && a.name.toLocaleLowerCase("pt") === name.toLocaleLowerCase("pt"))) throw new RosterConflictError("Já existe uma área com este nome neste centro.", "duplicate_name");
    const area = await this.repo.createArea(org, { locationId: input.locationId, name, sortOrder: same.reduce((m, a) => Math.max(m, a.sortOrder), -1) + 1 }, actor.email);
    await this.log(org, actor.email, "rosters.area.create", "work_area", area.id, null, area);
    return area;
  }

  /** Mudar o nome, a ordem ou desativar/reativar. Desativar não mexe nos turnos (mantêm a área no histórico). */
  async updateArea(org: OrganizationId, actor: Actor, id: string, patch: { name?: string; sortOrder?: number; active?: boolean }) {
    const all = await this.repo.listAreas(org);
    const before = all.find((a) => a.id === id);
    if (!before) throw new RosterNotFoundError("Área não encontrada.");
    const name = patch.name !== undefined ? validateAreaName(patch.name) : before.name;
    const active = patch.active ?? before.active;
    if (active && all.some((a) => a.id !== id && a.active && a.locationId === before.locationId && a.name.toLocaleLowerCase("pt") === name.toLocaleLowerCase("pt"))) {
      throw new RosterConflictError("Já existe uma área ativa com este nome neste centro.", "duplicate_name");
    }
    if (patch.sortOrder !== undefined && (!Number.isInteger(patch.sortOrder) || patch.sortOrder < 0)) throw new RosterValidationError("Ordem inválida.", "sortOrder");
    const after = await this.repo.updateArea(org, id, { ...(patch.name !== undefined && { name }), ...(patch.sortOrder !== undefined && { sortOrder: patch.sortOrder }), ...(patch.active !== undefined && { active }) });
    await this.log(org, actor.email, "rosters.area.update", "work_area", id, before, after);
    return after;
  }

  /**
   * Só para a organização de demonstração (dados fictícios): dá área aos turnos
   * (não folgas) de uma escala no período que ainda não a têm — no rascunho e
   * no estado publicado, sem criar versão nem avisar ninguém. `pick` escolhe a
   * área (ativa e do centro da escala) de cada colaborador/dia. Uma auditoria.
   */
  async fillMissingAreasForDemo(org: OrganizationId, actor: Actor, rosterId: string, from: string, to: string, pick: (employeeId: string, workDate: string) => string | null) {
    const roster = await this.roster(org, rosterId);
    const valid = new Set((await this.repo.listAreas(org)).filter((a) => a.active && (roster.targetType !== "location" || a.locationId === roster.targetId)).map((a) => a.id));
    const todo = (await this.repo.listShifts(org, { rosterId, from, to })).filter((s) => !s.deleted && s.kind === "shift" && !s.areaId);
    let filled = 0;
    for (let i = 0; i < todo.length; i += 10) {
      await Promise.all(
        todo.slice(i, i + 10).map(async (s) => {
          const areaId = pick(s.employeeId, s.workDate);
          if (!areaId || !valid.has(areaId)) return;
          await this.repo.updateShift(org, s.id, { areaId, ...(s.published && s.published.kind === "shift" && { published: { ...s.published, areaId } }) }, actor.email);
          filled++;
        }),
      );
    }
    if (filled) await this.log(org, actor.email, "rosters.area.demo_fill", "roster", rosterId, null, { from, to, filled });
    return { filled };
  }

  /**
   * A área de um turno: tem de existir, estar ativa e ser do centro da
   * escala (numa escala de grupo, de qualquer centro da empresa). Numa folga
   * não há área. Manter a área que o turno já tinha é sempre permitido (mesmo
   * desativada entretanto).
   */
  private async areaFor(org: OrganizationId, roster: Roster, input: { kind: "shift" | "day_off"; areaId?: string | null }, current: string | null = null): Promise<string | null> {
    if (input.kind === "day_off" || !input.areaId) return null;
    if (input.areaId === current) return current;
    const area = (await this.repo.listAreas(org)).find((a) => a.id === input.areaId);
    if (!area) throw new RosterValidationError("Área não encontrada.", "areaId");
    if (!area.active) throw new RosterValidationError("Esta área está desativada.", "areaId");
    if (roster.targetType === "location" && area.locationId !== roster.targetId) throw new RosterValidationError("A área não pertence ao centro desta escala.", "areaId");
    return area.id;
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

  /**
   * Visão "macro": cada escala ativa com quem tem turnos no período, quantas
   * alterações estão por publicar e a última publicação.
   */
  async summary(org: OrganizationId, from: string, to: string) {
    if (!DATE.test(from) || !DATE.test(to) || to < from || span(from, to) > 93) throw new RosterValidationError("Período inválido (máx. 93 dias).", "from");
    const rosters = (await this.repo.listRosters(org)).filter((r) => !r.archived);
    const shifts = await this.repo.listShifts(org, { from, to, includeDeleted: true });
    return Promise.all(
      rosters.map(async (r) => {
        const own = shifts.filter((s) => s.rosterId === r.id);
        const employeeIds = [...new Set(own.filter((s) => !s.deleted).map((s) => s.employeeId))];
        const lastPublication = (await this.repo.listPublications(org, r.id)).reduce<string | null>((max, p) => (!max || p.createdAt > max ? p.createdAt : max), null);
        return { roster: r, employeeIds, shifts: own.filter((s) => !s.deleted).length, pending: own.filter((s) => s.dirty).length, lastPublishedAt: lastPublication };
      }),
    );
  }

  /**
   * Seletor «Adicionar colaboradores»: quem pertence ao alvo da escala
   * (centro ou grupo, com as pertenças datadas da estrutura) e os turnos
   * planeados de cada pessoa NOUTRAS escalas no período (rascunho ou
   * publicado, com horário). Ter turnos noutro centro não torna ninguém
   * indisponível — a sobreposição só se decide ao atribuir um horário.
   */
  async candidates(org: OrganizationId, rosterId: string, from: string, to: string) {
    if (!DATE.test(from) || !DATE.test(to) || to < from || span(from, to) > MAX_VIEW_DAYS) throw new RosterValidationError(`Período inválido (máx. ${MAX_VIEW_DAYS} dias).`, "from");
    const roster = await this.roster(org, rosterId);
    const [members, shifts, rosters] = await Promise.all([this.ctx.targetMembers(org, roster.targetType, roster.targetId, from), this.repo.listShifts(org, { from, to }), this.repo.listRosters(org)]);
    const names = new Map(rosters.map((r) => [r.id, r.name]));
    const busy = shifts
      .filter((s) => !s.deleted && s.rosterId !== rosterId && s.kind === "shift")
      .map((s) => ({ employeeId: s.employeeId, rosterId: s.rosterId, rosterName: names.get(s.rosterId) ?? null, shiftId: s.id, workDate: s.workDate, hours: shiftHours(s), published: !s.dirty && s.published !== null }))
      .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.hours.localeCompare(b.hours));
    return { roster: { id: roster.id, targetType: roster.targetType, targetId: roster.targetId }, members, busy };
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
      const missing = [...draftIds].filter((id) => !touched.some((t) => t.id === id));
      for (const s of await Promise.all(missing.map((id) => this.repo.getShift(org, id)))) if (s) touched.push(s);
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
    // Ausências de cada colaborador em paralelo (blocos de 8) — antes uma pessoa de cada vez.
    const absences = new Map<string, Set<string>>();
    for (let i = 0; i < employees.length; i += 8) {
      const chunk = employees.slice(i, i + 8);
      const dates = await Promise.all(chunk.map((e) => this.ctx.approvedAbsenceDates(org, e, from, to)));
      chunk.forEach((e, k) => absences.set(e, new Set(dates[k])));
    }
    // Foco: os dias alterados e o dia seguinte (um noturno ou pouco descanso aparecem no turno de D+1).
    const focus = new Set(
      touched.flatMap((s) => [s, ...(s.published ? [s.published] : [])].flatMap((x) => [`${x.employeeId}|${x.workDate}`, `${x.employeeId}|${plusDays(x.workDate, 1)}`])),
    );
    // Regras de cada colaborador (antes valiam as do primeiro para todos).
    const rules = new Map(
      await Promise.all(employees.map(async (e) => [e, await this.ctx.rules(org, e, touched.find((t) => t.employeeId === e)?.workDate ?? touched[0]!.workDate)] as const)),
    );
    const fallback = rules.get(touched[0]!.employeeId) ?? (await this.ctx.rules(org, touched[0]!.employeeId, touched[0]!.workDate));
    return this.named(org, evaluate(states, (e) => rules.get(e) ?? fallback, absences, focus));
  }

  /** Acrescenta o nome da escala do outro turno (o gestor sabe onde o encontrar). */
  private async named(org: OrganizationId, violations: Violation[]): Promise<Violation[]> {
    if (!violations.some((v) => v.conflict?.rosterId)) return violations;
    const names = new Map((await this.repo.listRosters(org)).map((r) => [r.id, r.name]));
    return violations.map((v) => (v.conflict?.rosterId ? { ...v, conflict: { ...v.conflict, rosterName: names.get(v.conflict.rosterId) ?? null } } : v));
  }

  /**
   * Sobreposição bloqueia sempre — também em rascunho (não se planeia o mesmo
   * colaborador duas vezes à mesma hora, em nenhuma escala). Compara com o
   * estado planeado de cada turno (rascunho ou publicado) e entre os novos.
   */
  private async assertNoOverlap(org: OrganizationId, candidates: (ShiftState & { ignoreId?: string; rosterId?: string })[]): Promise<void> {
    const violations = await this.overlapViolations(org, candidates);
    if (violations.length) throw new RosterBlockedError(violations);
  }

  /**
   * Serviço central de disponibilidade (sobreposição): cada candidato contra
   * os turnos planeados do colaborador em TODAS as escalas e centros
   * (rascunhos e publicados; dias vizinhos incluídos por causa dos noturnos)
   * e contra os outros candidatos do mesmo pedido. O próprio turno
   * (`ignoreId`) nunca conta. Devolve o turno incompatível e o troço sobreposto.
   */
  async overlapViolations(org: OrganizationId, candidates: (ShiftState & { ignoreId?: string; rosterId?: string })[]): Promise<Violation[]> {
    return (await this.overlapsEach(org, candidates)).filter((v): v is Violation => !!v);
  }

  /** Como `overlapViolations`, mas uma posição por candidato (null = sem sobreposição; folgas nunca têm). */
  private async overlapsEach(org: OrganizationId, candidates: (ShiftState & { ignoreId?: string; rosterId?: string })[]): Promise<(Violation | null)[]> {
    const live = candidates.filter((c) => c.kind === "shift");
    if (!live.length) return candidates.map(() => null);
    const dates = live.map((c) => c.workDate).sort();
    const existing = await this.repo.listShifts(org, { employeeIds: [...new Set(live.map((c) => c.employeeId))], from: plusDays(dates[0]!, -1), to: plusDays(dates.at(-1)!, 1) });
    const ignore = new Set(live.map((c) => c.ignoreId).filter((x): x is string => !!x));
    const pool: CountedShift[] = existing.filter((s) => !s.deleted && !ignore.has(s.id)).map(planned);
    const names = new Map((await this.repo.listRosters(org)).map((r) => [r.id, r.name]));
    const violations: (Violation | null)[] = [];
    for (const c of candidates) {
      if (c.kind !== "shift") {
        violations.push(null);
        continue;
      }
      const hit = findOverlap(c, pool);
      if (!hit) violations.push(null);
      else {
        const o = hit.other;
        const where = o.id ? ` na escala «${(o.rosterId && names.get(o.rosterId)) || "—"}»` : " neste mesmo pedido";
        violations.push({
          rule: "overlap",
          severity: "block",
          employeeId: c.employeeId,
          workDate: c.workDate,
          shiftId: c.ignoreId ?? null,
          rosterId: c.rosterId ?? null,
          message: `Horário indisponível: já tem um turno${where} (${o.workDate}, ${shiftHours(o)}). Sobreposição entre ${hit.from} e ${hit.to}.`,
          conflict: { shiftId: o.id ?? null, rosterId: o.rosterId ?? null, rosterName: o.rosterId ? (names.get(o.rosterId) ?? null) : null, workDate: o.workDate, hours: shiftHours(o), published: o.published ?? false },
          overlap: `${hit.from}–${hit.to}`,
        });
      }
      pool.push({ ...stateOf(c), ...(c.rosterId && { rosterId: c.rosterId }) });
    }
    return violations;
  }

  /**
   * Gestores em simultâneo: depois de gravar volta a verificar contra o que
   * existe agora; se outro pedido planeou entretanto o mesmo colaborador à
   * mesma hora, retira o que acabou de gravar (nada fica a meio) e recusa.
   */
  private async recheckAfterInsert(org: OrganizationId, actor: Actor, created: RosterShift[]): Promise<void> {
    const violations = await this.overlapViolations(org, created.map((s) => ({ ...stateOf(s), ignoreId: s.id, rosterId: s.rosterId })));
    if (!violations.length) return;
    for (const s of created) await this.repo.updateShift(org, s.id, { deleted: true, dirty: false }, actor.email);
    throw new RosterBlockedError(violations);
  }

  /** Folgas: a mesma (escala, colaborador, dia) nunca fica duplicada — repetir uma operação não cria outra. */
  private async withoutDuplicateDaysOff<T extends ShiftState & { rosterId: string }>(org: OrganizationId, rows: T[]): Promise<T[]> {
    const off = rows.filter((r) => r.kind === "day_off");
    if (!off.length) return rows;
    const dates = off.map((r) => r.workDate).sort();
    const existing = await this.repo.listShifts(org, { employeeIds: [...new Set(off.map((r) => r.employeeId))], from: dates[0]!, to: dates.at(-1)! });
    const key = (x: { rosterId: string; employeeId: string; workDate: string }) => `${x.rosterId}|${x.employeeId}|${x.workDate}`;
    const have = new Set(existing.filter((s) => !s.deleted && s.kind === "day_off").map(key));
    return rows.filter((r) => {
      if (r.kind !== "day_off") return true;
      if (have.has(key(r))) return false;
      have.add(key(r));
      return true;
    });
  }

  async addShift(org: OrganizationId, actor: Actor, rosterId: string, input: ShiftInput) {
    const roster = await this.roster(org, rosterId);
    if (!DATE.test(input.workDate)) throw new RosterValidationError("Data inválida.", "workDate");
    if (!input.employeeId) throw new RosterValidationError("Indique o colaborador.", "employeeId");
    const seg = await this.segmentsFor(org, input);
    const areaId = await this.areaFor(org, roster, input);
    const row = { rosterId, employeeId: input.employeeId, workDate: input.workDate, kind: input.kind, segments: seg.segments, templateId: input.templateId, onCall: seg.onCall, areaId };
    if (!(await this.withoutDuplicateDaysOff(org, [row])).length) {
      // A folga já existe nesta escala: devolve-a em vez de criar outra (repetir não duplica).
      const same = (await this.repo.listShifts(org, { rosterId, employeeIds: [input.employeeId], from: input.workDate, to: input.workDate })).find((x) => !x.deleted && x.kind === "day_off");
      if (same) return { shift: same, warnings: [] as Violation[] };
    }
    await this.assertNoOverlap(org, [row]);
    const [s] = await this.repo.insertShifts(org, [row], actor.email);
    await this.recheckAfterInsert(org, actor, [s!]);
    return { shift: s!, warnings: await this.violationsFor(org, new Set([s!.id])) };
  }

  /**
   * Vários turnos de uma vez (cada um com o seu horário ou modelo), numa só
   * operação: as mesmas validações de `addShift` (sobreposição bloqueia,
   * avisos de restrições), um só registo de auditoria. Usado pelo Assistente
   * Mezza para pedidos em massa.
   */
  async addShifts(org: OrganizationId, actor: Actor, rosterId: string, inputs: ShiftInput[], source: string | null = null) {
    await this.roster(org, rosterId);
    if (!inputs.length) return { created: [] as RosterShift[], warnings: [] as Violation[] };
    if (inputs.length > MAX_BULK) throw new RosterValidationError(`No máximo ${MAX_BULK} turnos de uma vez.`, "shifts");
    const rows = [];
    for (const input of inputs) {
      if (!DATE.test(input.workDate)) throw new RosterValidationError("Data inválida.", "workDate");
      if (!input.employeeId) throw new RosterValidationError("Indique o colaborador.", "employeeId");
      const seg = await this.segmentsFor(org, input);
      rows.push({ rosterId, employeeId: input.employeeId, workDate: input.workDate, kind: input.kind, segments: seg.segments, templateId: input.templateId, onCall: seg.onCall, areaId: await this.areaFor(org, await this.roster(org, rosterId), input) });
    }
    const unique = await this.withoutDuplicateDaysOff(org, rows);
    await this.assertNoOverlap(org, unique);
    const created = unique.length ? await this.repo.insertShifts(org, unique, actor.email) : [];
    await this.recheckAfterInsert(org, actor, created);
    await this.log(org, actor.email, "rosters.shift.batch", "roster", rosterId, null, { count: created.length, shiftIds: created.map((c) => c.id), ...(source && { source }) });
    return { created, warnings: await this.violationsFor(org, new Set(created.map((c) => c.id)), created) };
  }

  /**
   * Disponibilidade para um turno hipotético (não grava nada): para cada
   * colaborador, o que as regras do rascunho diriam se lhe atribuíssemos
   * `segments` em `workDate` — sobreposição (bloqueia), descanso, ausência e
   * limites, com a severidade configurada. Conta o planeado atual (rascunho
   * ou publicado).
   */
  async availability(org: OrganizationId, rosterId: string, input: { workDate: string; segments: Segment[]; employeeIds: string[] }) {
    await this.roster(org, rosterId);
    if (!DATE.test(input.workDate)) throw new RosterValidationError("Data inválida.", "workDate");
    validateSegments(input.segments);
    if (input.employeeIds.length > 500) throw new RosterValidationError("No máximo 500 colaboradores de uma vez.", "employeeIds");
    if (!input.employeeIds.length) return [];
    const year = input.workDate.slice(0, 4);
    const existing = await this.repo.listShifts(org, { employeeIds: input.employeeIds, from: `${year}-01-01`, to: `${year}-12-31` });
    const planned = existing.filter((s) => !s.deleted).map(stateOf);
    const out: { employeeId: string; status: "available" | "warning" | "blocked"; reasons: Violation[] }[] = [];
    for (const employeeId of input.employeeIds) {
      const candidate: ShiftState = { employeeId, workDate: input.workDate, kind: "shift", segments: input.segments, templateId: null, onCall: false };
      const absences = new Map([[employeeId, new Set(await this.ctx.approvedAbsenceDates(org, employeeId, input.workDate, input.workDate))]]);
      const reasons = evaluate([...planned.filter((s) => s.employeeId === employeeId), candidate], await this.ctx.rules(org, employeeId, input.workDate), absences, new Set([`${employeeId}|${input.workDate}`]));
      out.push({ employeeId, status: reasons.some((v) => v.severity === "block") ? "blocked" : reasons.length ? "warning" : "available", reasons });
    }
    return out;
  }

  /**
   * Limpar os turnos pendentes (nunca publicados) de um colaborador na semana
   * visível desta escala, numa só operação. Publicados, outras semanas e
   * outras escalas não mexem. Devolve os retirados (para "desfazer").
   */
  async clearPending(org: OrganizationId, actor: Actor, rosterId: string, input: { employeeId: string; from: string; to: string; shiftIds?: string[] }) {
    await this.roster(org, rosterId);
    if (!input.employeeId) throw new RosterValidationError("Indique o colaborador.", "employeeId");
    if (!DATE.test(input.from) || !DATE.test(input.to) || input.to < input.from || span(input.from, input.to) > MAX_VIEW_DAYS) throw new RosterValidationError(`Período inválido (máx. ${MAX_VIEW_DAYS} dias).`, "from");
    if (input.shiftIds && input.shiftIds.length > MAX_BULK) throw new RosterValidationError(`No máximo ${MAX_BULK} turnos de uma vez.`, "shiftIds");
    const removed = await this.repo.clearPending(org, { rosterId, employeeId: input.employeeId, from: input.from, to: input.to, ...(input.shiftIds && { ids: input.shiftIds }) }, actor.email);
    if (removed.length) await this.log(org, actor.email, "rosters.shift.clear_pending", "roster", rosterId, null, { employeeId: input.employeeId, from: input.from, to: input.to, shiftIds: removed.map((s) => s.id) });
    return { removed };
  }

  /** Desfazer: repõe turnos pendentes retirados (com as regras de sobreposição de sempre). */
  async restoreShifts(org: OrganizationId, actor: Actor, rosterId: string, ids: string[]) {
    await this.roster(org, rosterId);
    if (!ids.length) return { restored: [], warnings: [] };
    if (ids.length > MAX_BULK) throw new RosterValidationError(`No máximo ${MAX_BULK} turnos de uma vez.`, "shiftIds");
    const rows = (await Promise.all(ids.map((id) => this.repo.getShift(org, id)))).filter((s): s is RosterShift => !!s && s.rosterId === rosterId && s.deleted && s.published === null);
    await this.assertNoOverlap(org, rows.map((s) => ({ ...stateOf(s), rosterId: s.rosterId })));
    const restored = await this.repo.restoreShifts(org, rosterId, rows.map((s) => s.id), actor.email);
    await this.recheckAfterInsert(org, actor, restored);
    if (restored.length) await this.log(org, actor.email, "rosters.shift.restore", "roster", rosterId, null, { shiftIds: restored.map((s) => s.id) });
    return { restored, warnings: restored.length ? await this.violationsFor(org, new Set(restored.map((s) => s.id))) : [] };
  }

  /** Atribuição em massa: colaboradores × dias (com filtro de dias da semana). */
  async assignBulk(org: OrganizationId, actor: Actor, rosterId: string, input: { employeeIds: string[]; from: string; to: string; weekdays: string[]; kind: "shift" | "day_off"; templateId: string | null; areaId?: string | null }) {
    await this.roster(org, rosterId);
    if (!DATE.test(input.from) || !DATE.test(input.to) || input.to < input.from || span(input.from, input.to) > MAX_VIEW_DAYS) throw new RosterValidationError(`Período inválido (máx. ${MAX_VIEW_DAYS} dias).`, "from");
    if (!input.employeeIds.length) throw new RosterValidationError("Escolha pelo menos um colaborador.", "employeeIds");
    if (input.kind === "shift" && !input.templateId) throw new RosterValidationError("Escolha o modelo de turno.", "templateId");
    const seg = await this.segmentsFor(org, { employeeId: "", workDate: input.from, kind: input.kind, templateId: input.templateId, segments: [] });
    const dates: string[] = [];
    for (let d = input.from; d <= input.to; d = plusDays(d, 1)) if (!input.weekdays.length || input.weekdays.includes(String(DateTime.fromISO(d, { zone: "utc" }).weekday))) dates.push(d);
    const areaId = await this.areaFor(org, await this.roster(org, rosterId), { kind: input.kind, areaId: input.areaId ?? null });
    const rows = input.employeeIds.flatMap((employeeId) => dates.map((workDate) => ({ rosterId, employeeId, workDate, kind: input.kind, segments: seg.segments, templateId: input.templateId, onCall: seg.onCall, areaId })));
    if (rows.length > MAX_BULK) throw new RosterValidationError(`No máximo ${MAX_BULK} turnos de uma vez.`, "employeeIds");
    // Tudo ou nada: com sobreposições nada é gravado (a resposta lista-as para rever antes de repetir).
    const unique = await this.withoutDuplicateDaysOff(org, rows);
    await this.assertNoOverlap(org, unique);
    const created = unique.length ? await this.repo.insertShifts(org, unique, actor.email) : [];
    await this.recheckAfterInsert(org, actor, created);
    await this.log(org, actor.email, "rosters.shift.bulk", "roster", rosterId, null, { count: created.length, ...input });
    return { created: created.length, warnings: await this.violationsFor(org, new Set(created.map((c) => c.id)), created) };
  }

  /**
   * Copiar a semana (`from` … +6) desta escala para a seguinte (+7 dias), em
   * rascunho: turnos e folgas no estado planeado (rascunho ou publicado).
   * Nunca mexe num dia da semana seguinte que já tenha algo nesta escala.
   * Ao contrário da atribuição em massa não é tudo-ou-nada: o que se
   * sobrepõe a outro turno (noutra escala) ou está fora do âmbito
   * (`canCopy`) salta e vem na resposta; o resto é copiado. Uma área que
   * entretanto deixou de ser válida fica «Sem área».
   */
  async copyWeek(org: OrganizationId, actor: Actor, rosterId: string, input: { from: string }, canCopy: (employeeId: string) => Promise<boolean> = async () => true) {
    const roster = await this.roster(org, rosterId);
    if (!DATE.test(input.from) || !DateTime.fromISO(input.from, { zone: "utc" }).isValid) throw new RosterValidationError("Data inválida.", "from");
    const to = plusDays(input.from, 6);
    const [source, target] = await Promise.all([
      this.repo.listShifts(org, { rosterId, from: input.from, to }),
      this.repo.listShifts(org, { rosterId, from: plusDays(input.from, 7), to: plusDays(to, 7) }),
    ]);
    const key = (employeeId: string, workDate: string) => `${employeeId}|${workDate}`;
    const filled = new Set(target.filter((s) => !s.deleted).map((s) => key(s.employeeId, s.workDate)));
    const areas = new Set((await this.repo.listAreas(org)).filter((a) => a.active && (roster.targetType !== "location" || a.locationId === roster.targetId)).map((a) => a.id));
    const allowed = new Map<string, boolean>();
    const skipped = { existing: 0, outOfScope: 0, overlap: [] as Violation[] };
    const rows: (ShiftState & { rosterId: string })[] = [];
    for (const s of source.filter((x) => !x.deleted)) {
      const workDate = plusDays(s.workDate, 7);
      if (filled.has(key(s.employeeId, workDate))) {
        skipped.existing++;
        continue;
      }
      if (!allowed.has(s.employeeId)) allowed.set(s.employeeId, await canCopy(s.employeeId));
      if (!allowed.get(s.employeeId)) {
        skipped.outOfScope++;
        continue;
      }
      const areaId = s.kind === "shift" && s.areaId && areas.has(s.areaId) ? s.areaId : null;
      rows.push({ rosterId, employeeId: s.employeeId, workDate, kind: s.kind, segments: s.segments, templateId: s.templateId, onCall: s.onCall, areaId });
    }
    if (rows.length > MAX_BULK) throw new RosterValidationError(`No máximo ${MAX_BULK} turnos de uma vez.`, "from");
    const overlaps = await this.overlapsEach(org, rows);
    skipped.overlap = overlaps.filter((v): v is Violation => !!v);
    const free = rows.filter((_, i) => !overlaps[i]);
    const created = free.length ? await this.repo.insertShifts(org, free, actor.email) : [];
    await this.recheckAfterInsert(org, actor, created);
    await this.log(org, actor.email, "rosters.shift.copy_week", "roster", rosterId, null, { from: input.from, to: plusDays(to, 7), count: created.length, skipped: { existing: skipped.existing, outOfScope: skipped.outOfScope, overlap: skipped.overlap.length } });
    return { created: created.length, skipped, warnings: await this.violationsFor(org, new Set(created.map((c) => c.id)), created) };
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
      areaId: input.areaId !== undefined ? input.areaId : (cur.areaId ?? null),
    };
    const seg = input.kind || input.templateId !== undefined || input.segments ? await this.segmentsFor(org, merged) : { segments: cur.segments, onCall: cur.onCall };
    // Mudar a área segue a regra das outras alterações (num turno publicado: motivo, versão nova e aviso).
    const areaId = input.areaId !== undefined || input.kind ? await this.areaFor(org, await this.roster(org, cur.rosterId), merged, cur.areaId ?? null) : (cur.areaId ?? null);
    const draft: RosterShift = { ...cur, employeeId: merged.employeeId, kind: merged.kind, templateId: merged.templateId, segments: seg.segments, onCall: seg.onCall, areaId, deleted: false, dirty: true };
    await this.assertNoOverlap(org, [{ ...stateOf(draft), ignoreId: cur.id, rosterId: cur.rosterId }]);
    if (cur.published) return this.publishNow(org, actor, cur, draft, opts.reason!.trim(), opts.confirm);
    const saved = await this.repo.updateShift(org, id, { employeeId: draft.employeeId, kind: draft.kind, templateId: draft.templateId, segments: draft.segments, onCall: draft.onCall, areaId: draft.areaId ?? null, deleted: false, dirty: true }, actor.email);
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
      { employeeId: draft.employeeId, kind: draft.kind, templateId: draft.templateId, segments: draft.segments, onCall: draft.onCall, areaId: draft.areaId ?? null, deleted: draft.deleted, dirty: false, published: after, publishedVersion: version },
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
      // O título leva o motivo escrito pelo gestor: corta-se ao máximo das notificações (160).
      await this.notifier.notify(org, users, { title: title.length > 160 ? `${title.slice(0, 159)}…` : title, body: `A escala "${roster.name}" foi atualizada. Veja os seus turnos.`, link: "/hr/novo/escalas", dedupeKey: `roster:${roster.id}:${roster.version + 1}` });
    }
    this.hook.published(
      org,
      changes.flatMap((c) => [c.before, c.after].filter((x): x is ShiftState => !!x).map((s) => ({ employeeId: s.employeeId, workDate: s.workDate }))),
    );
  }

  /**
   * Pendentes da escala; com `period` só os desse período (ex.: a semana
   * visível). Os turnos de fora continuam a contar nas regras (vizinhos,
   * semana, ano), mas os problemas deles não bloqueiam este período.
   */
  private async pending(org: OrganizationId, rosterId: string, period?: { from: string; to: string } | null) {
    if (period && (!DATE.test(period.from) || !DATE.test(period.to) || period.to < period.from)) throw new RosterValidationError("Período inválido.", "from");
    const all = (await this.repo.listShifts(org, { rosterId, from: period?.from ?? "1900-01-01", to: period?.to ?? "2999-12-31", includeDeleted: true })).filter((s) => s.dirty);
    return all;
  }

  /** Pré-visualização das restrições do que está por publicar (toda a escala ou só o período). */
  async check(org: OrganizationId, rosterId: string, period?: { from: string; to: string } | null) {
    await this.roster(org, rosterId);
    const dirty = await this.pending(org, rosterId, period);
    return { pending: dirty.length, violations: await this.violationsFor(org, new Set(dirty.map((d) => d.id)), dirty) };
  }

  /** RE-17: publicar cria uma versão (histórico) e avisa os colaboradores afetados. Com `period`, publica só esse período. */
  async publish(org: OrganizationId, actor: Actor, rosterId: string, opts: { reason: string | null; confirm: boolean; from?: string | null; to?: string | null }) {
    const roster = await this.roster(org, rosterId);
    const dirty = await this.pending(org, rosterId, opts.from && opts.to ? { from: opts.from, to: opts.to } : null);
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
    const mine = (await this.repo.listShifts(org, { employeeIds: [employeeId], from, to, includeDeleted: true })).filter((s) => s.published?.employeeId === employeeId);
    if (!mine.length) return { employeeId, shifts: [] };
    // Onde e o quê (campos aditivos): centro = área do turno, senão o centro da escala; modelo = nome, abreviatura e cor.
    const [rosters, areas, templates, locations] = await Promise.all([this.repo.listRosters(org), this.repo.listAreas(org), this.repo.listTemplates(org), this.ctx.locationNames(org)]);
    const rosterById = new Map(rosters.map((r) => [r.id, r]));
    const areaById = new Map(areas.map((a) => [a.id, a]));
    const templateById = new Map(templates.map((t) => [t.id, t]));
    return {
      employeeId,
      shifts: mine.map((s) => {
        const p = s.published!;
        const roster = rosterById.get(s.rosterId);
        const area = p.areaId ? areaById.get(p.areaId) : undefined;
        const locationId = area?.locationId ?? (roster?.targetType === "location" ? roster.targetId : null);
        const template = p.templateId ? templateById.get(p.templateId) : undefined;
        return {
          id: s.id,
          rosterId: s.rosterId,
          ...p,
          rosterName: roster?.name ?? null,
          locationId,
          locationName: locationId ? (locations.get(locationId) ?? null) : null,
          areaName: area?.name ?? null,
          template: template ? { name: template.name, abbreviation: template.abbreviation, color: template.color } : null,
        };
      }),
    };
  }

  /**
   * Colegas do meu turno (Portal): turnos publicados da mesma escala com
   * horário sobreposto (inclui noturnos de dias vizinhos). Só nome curto, cargo
   * e horário — nunca contactos nem ids. Desligado por omissão (ADR-0030):
   * com a regra desligada, o servidor recusa (a UI só esconde).
   */
  async myShiftCoworkers(org: OrganizationId, actor: Actor, shiftId: string) {
    const me = await this.ctx.employeeForUser(org, actor.userId);
    if (!me) throw new RosterNotFoundError("Esta conta não está ligada a uma ficha de colaborador.");
    const mine = await this.repo.getShift(org, shiftId);
    const p = mine?.published;
    if (!mine || mine.deleted || !p || p.employeeId !== me || p.kind !== "shift") throw new RosterNotFoundError("Turno não encontrado.");
    if (!(await this.ctx.coworkersVisible(org, me, p.workDate))) throw new RosterForbiddenError("Os turnos dos colegas não estão visíveis nesta empresa.");
    const nearby = await this.repo.listShifts(org, { rosterId: mine.rosterId, from: plusDays(p.workDate, -1), to: plusDays(p.workDate, 1) });
    const overlapping = nearby.filter((s) => !s.deleted && s.published && s.published.kind === "shift" && s.published.employeeId !== me && shiftsOverlap(p, s.published));
    if (!overlapping.length) return { coworkers: [] };
    const people = new Map((await this.ctx.peopleBrief(org, [...new Set(overlapping.map((s) => s.published!.employeeId))])).map((x) => [x.id, x]));
    const coworkers = overlapping
      .flatMap((s) => {
        const who = people.get(s.published!.employeeId);
        return who?.active ? [{ shortName: coworkerShortName(who.fullName), positionName: who.positionName, hours: hoursLabel(s.published!.segments), sort: `${s.published!.workDate}${s.published!.segments[0]?.start ?? ""}` }] : [];
      })
      .sort((a, b) => a.sort.localeCompare(b.sort) || a.shortName.localeCompare(b.shortName, "pt"))
      .map(({ sort: _s, ...c }) => c);
    return { coworkers };
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

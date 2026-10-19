import { DateTime } from "luxon";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { stateOf, type RosterShift, type ShiftState } from "../../domain/entities/roster.js";
import { RosterConflictError, RosterNotFoundError, RosterValidationError } from "../../domain/errors.js";
import type { CoverageContextPort, CoverageRulesRepositoryPort } from "../../domain/ports/out/coverage.ports.js";
import type { RostersAuditPort, RostersRepositoryPort } from "../../domain/ports/out/rosters.ports.js";
import { coverageDay, validateCoverageRule, type CoverageDay, type CoverageRule, type CoverageRuleInput } from "../../domain/services/coverage.js";
import type { Actor } from "./rosters.use-cases.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 62;
const plusDays = (d: string, n: number) => DateTime.fromISO(d, { zone: "utc" }).plus({ days: n }).toISODate()!;

export interface CoverageReport {
  enabled: boolean;
  /** Centro da escala (null numa escala de grupo: a cobertura é por centro). */
  locationId: string | null;
  days: CoverageDay[];
}

/**
 * Plano de Cobertura (opcional por empresa, desligado por omissão): regras de
 * mínimos por centro/área e o cálculo planeado vs. publicado de uma escala.
 * Só informa — nunca bloqueia a publicação.
 */
export class CoverageUseCases {
  constructor(
    private readonly rules: CoverageRulesRepositoryPort,
    private readonly repo: RostersRepositoryPort,
    private readonly ctx: CoverageContextPort,
    private readonly audit: RostersAuditPort,
  ) {}

  async status(org: OrganizationId) {
    return { enabled: await this.ctx.enabled(org) };
  }

  /** Ligar/desligar nas Escalas (opcional por empresa). As regras ficam guardadas quando se desliga. */
  async setEnabled(org: OrganizationId, actor: Actor, enabled: boolean) {
    const before = await this.ctx.enabled(org);
    if (before !== enabled) {
      await this.ctx.setEnabled(org, actor.userId, enabled);
      await this.audit.record(org, { actor: actor.email, action: "rosters.coverage.toggle", resourceType: "coverage_rule", resourceId: null, before: { enabled: before }, after: { enabled }, reason: null });
    }
    return { enabled };
  }

  listRules(org: OrganizationId, locationId: string | null) {
    return this.rules.listCoverageRules(org, locationId);
  }

  private async requireEnabled(org: OrganizationId) {
    if (!(await this.ctx.enabled(org))) throw new RosterConflictError("O Plano de Cobertura está desligado nesta empresa (Configurações → Funcionalidades).", "invalid_state");
  }

  /** A área tem de ser do centro da regra e estar ativa. */
  private async checkArea(org: OrganizationId, input: CoverageRuleInput) {
    if (!input.areaId) return;
    const area = (await this.repo.listAreas(org)).find((a) => a.id === input.areaId);
    if (!area || area.locationId !== input.locationId) throw new RosterValidationError("A área não pertence a este centro.", "areaId");
    if (!area.active) throw new RosterValidationError("Esta área está desativada.", "areaId");
  }

  async createRule(org: OrganizationId, actor: Actor, input: CoverageRuleInput) {
    await this.requireEnabled(org);
    const clean: CoverageRuleInput = { ...input, areaId: input.areaId || null, weekday: input.weekday ?? null, date: input.date || null };
    validateCoverageRule(clean);
    await this.checkArea(org, clean);
    const same = (await this.rules.listCoverageRules(org, clean.locationId)).find(
      (r) => r.areaId === clean.areaId && r.weekday === clean.weekday && r.date === clean.date && r.start === clean.start && r.end === clean.end,
    );
    if (same) throw new RosterConflictError("Já existe uma regra para este dia e intervalo — altere o mínimo dessa.", "duplicate_name");
    const rule = await this.rules.createCoverageRule(org, clean, actor.email);
    await this.audit.record(org, { actor: actor.email, action: "rosters.coverage.create", resourceType: "coverage_rule", resourceId: rule.id, before: null, after: rule, reason: null });
    return rule;
  }

  async updateRule(org: OrganizationId, actor: Actor, id: string, patch: Partial<Pick<CoverageRule, "start" | "end" | "minPeople">>) {
    await this.requireEnabled(org);
    const before = (await this.rules.listCoverageRules(org)).find((r) => r.id === id);
    if (!before) throw new RosterNotFoundError("Regra não encontrada.");
    const next = { ...before, ...patch };
    validateCoverageRule(next);
    const after = await this.rules.updateCoverageRule(org, id, { start: next.start, end: next.end, minPeople: next.minPeople });
    await this.audit.record(org, { actor: actor.email, action: "rosters.coverage.update", resourceType: "coverage_rule", resourceId: id, before, after, reason: null });
    return after;
  }

  async deleteRule(org: OrganizationId, actor: Actor, id: string) {
    await this.requireEnabled(org);
    const before = (await this.rules.listCoverageRules(org)).find((r) => r.id === id);
    if (!before) throw new RosterNotFoundError("Regra não encontrada.");
    await this.rules.deleteCoverageRule(org, id);
    await this.audit.record(org, { actor: actor.email, action: "rosters.coverage.delete", resourceType: "coverage_rule", resourceId: id, before, after: null, reason: null });
  }

  /**
   * Cobertura do centro de uma escala no período: o centro inteiro e cada
   * área (ativa ou com regras), dia a dia. Contam os turnos das escalas do
   * centro e, de escalas de grupo, os turnos com uma área deste centro. Cada
   * pessoa conta uma vez; folgas e dias de ausência aprovada não contam.
   */
  async coverage(org: OrganizationId, rosterId: string, from: string, to: string): Promise<CoverageReport> {
    if (!DATE.test(from) || !DATE.test(to) || to < from || DateTime.fromISO(to).diff(DateTime.fromISO(from), "days").days + 1 > MAX_DAYS) {
      throw new RosterValidationError(`Período inválido (máx. ${MAX_DAYS} dias).`, "from");
    }
    const all = await this.repo.listRosters(org);
    const roster = all.find((r) => r.id === rosterId);
    if (!roster) throw new RosterNotFoundError("Escala não encontrada.");
    if (!(await this.ctx.enabled(org))) return { enabled: false, locationId: null, days: [] };
    if (roster.targetType !== "location") return { enabled: true, locationId: null, days: [] };
    const locationId = roster.targetId;

    const [rules, areas] = await Promise.all([this.rules.listCoverageRules(org, locationId), this.repo.listAreas(org)]);
    const areaIds = new Set(areas.filter((a) => a.locationId === locationId).map((a) => a.id));
    // Turnos noturnos da véspera cobrem a madrugada; regras do último dia podem acabar no dia seguinte.
    const [lo, hi] = [plusDays(from, -1), plusDays(to, 1)];
    const sources = all.filter((r) => !r.archived && (r.targetType === "group" || r.targetId === locationId));
    const shifts = (await Promise.all(sources.map((r) => this.repo.listShifts(org, { rosterId: r.id, from: lo, to: hi, includeDeleted: true })))).flat();
    const inCentre = (s: ShiftState | null, r: RosterShift) => !!s && (sources.find((x) => x.id === r.rosterId)?.targetType === "location" || areaIds.has(s.areaId ?? ""));
    const planned = shifts.flatMap((s) => (s.deleted ? [] : [stateOf(s)]).filter((st) => inCentre(st, s)));
    const published = shifts.flatMap((s) => (s.published ? [s.published] : []).filter((st) => inCentre(st, s)));

    const people = [...new Set([...planned, ...published].map((s) => s.employeeId))];
    const absentDays = new Set(
      (await Promise.all(people.map(async (e) => (await this.ctx.approvedAbsenceDates(org, e, lo, hi)).map((d) => `${e}|${d}`)))).flat(),
    );
    const absent = (e: string, d: string) => absentDays.has(`${e}|${d}`);

    // Âmbitos: o centro inteiro e as áreas ativas ou que tenham regras (pela ordem do centro).
    const withRules = new Set(rules.map((r) => r.areaId).filter((a): a is string => !!a));
    const scopes: (string | null)[] = [null, ...areas.filter((a) => a.locationId === locationId && (a.active || withRules.has(a.id))).map((a) => a.id)];
    const days: CoverageDay[] = [];
    for (let d = from; d <= to; d = plusDays(d, 1)) {
      for (const areaId of scopes) {
        const of = (list: ShiftState[]) => (areaId ? list.filter((s) => s.areaId === areaId) : list);
        days.push(coverageDay({ date: d, areaId, rules, planned: of(planned), published: of(published), absent }));
      }
    }
    return { enabled: true, locationId, days };
  }
}

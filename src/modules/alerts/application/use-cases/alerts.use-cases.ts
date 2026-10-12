import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { AlertError, needsEscalation, qualifies, validateRule, type AlertRuleInput } from "../../domain/entities/alert.js";
import type { AlertsContextPort, AlertsRepositoryPort } from "../../domain/ports/out/alerts.ports.js";

/** Avaliação automática no máximo de 10 em 10 minutos por organização (ADR-0033). */
const EVALUATE_EVERY_MS = 10 * 60_000;

export interface Actor {
  userId: string;
  email: string;
}

export class AlertsUseCases {
  private readonly lastRun = new Map<string, number>();

  constructor(
    private readonly repo: AlertsRepositoryPort,
    private readonly ctx: AlertsContextPort,
  ) {}

  listRules(org: OrganizationId) {
    return this.repo.listRules(org);
  }

  async createRule(org: OrganizationId, actor: Actor, input: AlertRuleInput) {
    validateRule(input);
    const r = await this.repo.createRule(org, input, actor.email);
    await this.ctx.audit(org, { actor: actor.email, action: "alerts.rule.create", resourceId: r.id, after: r, reason: null });
    return r;
  }

  async updateRule(org: OrganizationId, actor: Actor, id: string, input: AlertRuleInput) {
    validateRule(input);
    if (!(await this.repo.listRules(org)).some((r) => r.id === id)) throw new AlertError("Regra não encontrada.", "not_found");
    const r = await this.repo.updateRule(org, id, input);
    await this.ctx.audit(org, { actor: actor.email, action: "alerts.rule.update", resourceId: id, after: r, reason: null });
    return r;
  }

  /**
   * Avalia as regras: abre alertas novos (sem duplicados), fecha os que já
   * não têm origem pendente e escala os que passaram o prazo (RE-24, RE-36).
   */
  async evaluate(org: OrganizationId): Promise<{ opened: number; closed: number; escalated: number }> {
    const now = this.ctx.now();
    this.lastRun.set(org, Date.parse(now));
    let opened = 0;
    let closed = 0;
    let escalated = 0;
    const rules = (await this.repo.listRules(org)).filter((r) => r.enabled);
    const active = await this.repo.listAlerts(org, { status: "active" });
    for (const rule of rules) {
      const qualifying = (await this.ctx.candidates(org, rule.kind)).filter((c) => qualifies(c, rule.thresholdDays, now));
      const owners = await this.ctx.resolveOwner(org, rule.owner);
      for (const c of qualifying) {
        const a = await this.repo.openAlert(org, {
          ruleId: rule.id,
          sourceType: c.sourceType,
          sourceId: c.sourceId,
          employeeId: c.employeeId,
          title: c.title,
          ownerUserIds: owners,
          dueAt: new Date(Date.parse(now) + rule.slaHours * 3_600_000).toISOString(),
        });
        if (!a) continue;
        opened++;
        await this.ctx.notify(org, owners, { title: `Alerta: ${a.title}`, body: `Prazo: ${a.dueAt.slice(0, 16).replace("T", " ")}.`, link: "/hr/novo/alertas", dedupeKey: `alert:${a.id}` });
      }
      // Origem já não está pendente → fecha sozinho.
      for (const a of active.filter((x) => x.ruleId === rule.id)) {
        if (qualifying.some((c) => c.sourceType === a.sourceType && c.sourceId === a.sourceId)) continue;
        if (await this.repo.updateAlert(org, a.id, ["open", "in_progress"], { status: "closed", closedBy: "sistema", closedAt: now, closeNote: "A origem deixou de estar pendente." })) closed++;
      }
    }
    for (const a of await this.repo.listAlerts(org, { status: "active" })) {
      if (!needsEscalation(a, now)) continue;
      const rule = rules.find((r) => r.id === a.ruleId);
      if (!rule?.escalateTo) continue;
      const to = await this.ctx.resolveOwner(org, rule.escalateTo);
      const updated = await this.repo.updateAlert(org, a.id, ["open", "in_progress"], { escalatedAt: now, escalatedTo: to, ownerUserIds: [...new Set([...a.ownerUserIds, ...to])] });
      if (!updated) continue;
      escalated++;
      await this.ctx.notify(org, to, { title: `Alerta escalado: ${a.title}`, body: "O prazo de tratamento passou.", link: "/hr/novo/alertas", dedupeKey: `alert:${a.id}:escalated` });
      await this.ctx.audit(org, { actor: "sistema", action: "alerts.escalate", resourceId: a.id, after: { to }, reason: null });
    }
    return { opened, closed, escalated };
  }

  /** Lista (avaliando antes, se a última avaliação tiver mais de 10 minutos). */
  async list(org: OrganizationId, status?: "open" | "in_progress" | "closed" | "active") {
    const last = this.lastRun.get(org) ?? 0;
    if (Date.parse(this.ctx.now()) - last > EVALUATE_EVERY_MS) await this.evaluate(org);
    return this.repo.listAlerts(org, status ? { status } : {});
  }

  async take(org: OrganizationId, actor: Actor, id: string) {
    const a = await this.repo.getAlert(org, id);
    if (!a) throw new AlertError("Alerta não encontrado.", "not_found");
    const updated = await this.repo.updateAlert(org, id, ["open"], { status: "in_progress", takenBy: actor.email });
    if (!updated) throw new AlertError("Este alerta já não está aberto.", "invalid_state");
    await this.ctx.audit(org, { actor: actor.email, action: "alerts.take", resourceId: id, after: updated, reason: null });
    return updated;
  }

  /** Fecho manual exige nota (RE-36). */
  async close(org: OrganizationId, actor: Actor, id: string, note: string) {
    if (!note?.trim()) throw new AlertError("Indique como ficou resolvido.", "validation", "note");
    const a = await this.repo.getAlert(org, id);
    if (!a) throw new AlertError("Alerta não encontrado.", "not_found");
    const updated = await this.repo.updateAlert(org, id, ["open", "in_progress"], { status: "closed", closedBy: actor.email, closedAt: this.ctx.now(), closeNote: note.trim() });
    if (!updated) throw new AlertError("Este alerta já está fechado.", "invalid_state");
    await this.ctx.audit(org, { actor: actor.email, action: "alerts.close", resourceId: id, after: updated, reason: note.trim() });
    return updated;
  }
}

import { DateTime } from "luxon";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { diffTotals, overlapsPeriod, sumTotals, type EmployeeTotals, type PayPeriod } from "../../domain/entities/period.js";
import { PeriodConflictError, PeriodForbiddenError, PeriodNotFoundError, PeriodValidationError } from "../../domain/errors.js";
import type { PeriodsAuditPort, PeriodsContextPort, PeriodsRepositoryPort, PeriodsSupportPort } from "../../domain/ports/out/periods.ports.js";
import { billingByLocationCsv, payrollCsv } from "../../domain/services/csv-export.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EXPORT_TTL_HOURS = 24;
const plusDays = (d: string, n: number) => DateTime.fromISO(d, { zone: "utc" }).plus({ days: n }).toISODate()!;

export interface Actor {
  userId: string;
  email: string;
}

export class PeriodsUseCases {
  constructor(
    private readonly repo: PeriodsRepositoryPort,
    private readonly ctx: PeriodsContextPort,
    private readonly support: PeriodsSupportPort,
    private readonly audit: PeriodsAuditPort,
  ) {}

  private log(org: OrganizationId, actor: string, action: string, resourceId: string | null, before: unknown, after: unknown, reason: string | null = null) {
    return this.audit.record(org, { actor, action, resourceType: "pay_period", resourceId, before, after, reason });
  }

  private async period(org: OrganizationId, id: string) {
    const p = (await this.repo.listPeriods(org)).find((x) => x.id === id);
    if (!p) throw new PeriodNotFoundError("Período não encontrado.");
    return p;
  }

  listPeriods(org: OrganizationId) {
    return this.repo.listPeriods(org);
  }

  async createPeriod(org: OrganizationId, actor: Actor, input: { scopeType: PayPeriod["scopeType"]; scopeId: string | null; startDate: string; endDate: string }) {
    if (input.scopeType !== "organization" && input.scopeType !== "location") throw new PeriodValidationError("Âmbito inválido.", "scopeType");
    if (input.scopeType === "location" && !input.scopeId) throw new PeriodValidationError("Indique o centro.", "scopeId");
    if (!DATE.test(input.startDate) || !DATE.test(input.endDate) || input.endDate < input.startDate) throw new PeriodValidationError("Datas inválidas.", "startDate");
    if (input.endDate > plusDays(input.startDate, 92)) throw new PeriodValidationError("Um período tem no máximo 93 dias.", "endDate");
    const scopeId = input.scopeType === "organization" ? null : input.scopeId;
    if ((await this.repo.listPeriods(org)).some((p) => p.scopeType === input.scopeType && p.scopeId === scopeId && overlapsPeriod(p, input))) {
      throw new PeriodConflictError("Já existe um período neste âmbito com estas datas.", "overlap");
    }
    const p = await this.repo.createPeriod(org, { scopeType: input.scopeType, scopeId, startDate: input.startDate, endDate: input.endDate }, actor.email);
    await this.log(org, actor.email, "periods.create", p.id, null, p);
    return p;
  }

  /** Pré-verificação (11): pendentes que impedem um fecho limpo. */
  async precheck(org: OrganizationId, id: string) {
    const p = await this.period(org, id);
    const employees = await this.ctx.employeesInScope(org, p);
    return { period: p, employees: employees.length, pending: await this.ctx.pendingItems(org, employees, p.startDate, p.endDate) };
  }

  /**
   * Fechar: com pendentes, só com exceção explícita (motivo + lista gravada).
   * Recalcula/sincroniza, guarda a fotografia e, se já houve fecho, as diferenças.
   */
  async close(org: OrganizationId, actor: Actor, id: string, exceptionReason: string | null) {
    const p = await this.period(org, id);
    if (p.status === "closed") throw new PeriodConflictError("O período já está fechado.", "invalid_state");
    const employees = await this.ctx.employeesInScope(org, p);
    const pending = await this.ctx.pendingItems(org, employees, p.startDate, p.endDate);
    if (pending.length && !exceptionReason?.trim()) throw new PeriodConflictError("Há pendentes no período. Resolva-os ou aprove uma exceção com motivo.", "precheck_failed", pending);
    for (const e of employees) await this.ctx.prepare(org, e, p.startDate, p.endDate);
    const totals: EmployeeTotals[] = [];
    for (const e of employees) totals.push(await this.ctx.totals(org, e, p.startDate, p.endDate));
    const previous = (await this.repo.listClosures(org, id)).sort((a, b) => b.closureNo - a.closureNo)[0];
    if (!(await this.repo.setStatus(org, id, ["open", "reopened"], "closed"))) throw new PeriodConflictError("O período mudou entretanto.", "invalid_state");
    const closure = await this.repo.insertClosure(org, {
      periodId: id,
      closureNo: (previous?.closureNo ?? 0) + 1,
      closedBy: actor.email,
      exceptionReason: pending.length ? exceptionReason!.trim() : null,
      exceptions: pending,
      totals,
      diff: previous ? diffTotals(previous.totals, totals) : null,
    });
    await this.log(org, actor.email, "periods.close", id, { status: p.status }, { closureNo: closure.closureNo, employees: totals.length, exceptions: pending.length, sums: sumTotals(totals) }, exceptionReason);
    return closure;
  }

  async closures(org: OrganizationId, id: string) {
    await this.period(org, id);
    return (await this.repo.listClosures(org, id)).sort((a, b) => b.closureNo - a.closureNo);
  }

  // ── Reabertura com dupla aprovação (TK-18) ──────────────────────────
  async requestReopen(org: OrganizationId, actor: Actor, id: string, reason: string) {
    const p = await this.period(org, id);
    if (p.status !== "closed") throw new PeriodConflictError("Só se reabre um período fechado.", "invalid_state");
    if (!reason?.trim()) throw new PeriodValidationError("Indique o motivo da reabertura.", "reason");
    if ((await this.repo.listReopenings(org, id)).some((r) => r.status === "pending")) throw new PeriodConflictError("Já há um pedido de reabertura pendente.", "reopen_pending");
    const r = await this.repo.insertReopening(org, { periodId: id, requestedBy: actor.email, requestedByUserId: actor.userId, reason: reason.trim() });
    await this.log(org, actor.email, "periods.reopen.request", id, null, r, reason);
    return r;
  }

  listReopenings(org: OrganizationId) {
    return this.repo.listReopenings(org);
  }

  /** Cada aprovação é de uma pessoa diferente e nunca de quem pediu; com 2, o período reabre. */
  async approveReopen(org: OrganizationId, actor: Actor, reopeningId: string) {
    const r = await this.repo.getReopening(org, reopeningId);
    if (!r) throw new PeriodNotFoundError("Pedido de reabertura não encontrado.");
    if (r.status !== "pending") throw new PeriodConflictError("Este pedido já foi decidido.", "invalid_state");
    if (r.requestedByUserId === actor.userId) throw new PeriodForbiddenError("Quem pede a reabertura não a pode aprovar.");
    if (r.approvals.some((a) => a.userId === actor.userId)) throw new PeriodConflictError("Já aprovou este pedido; falta outra pessoa.", "already_approved");
    const approvals = [...r.approvals, { userId: actor.userId, by: actor.email, at: this.support.now() }];
    const done = approvals.length >= 2;
    const updated = await this.repo.updateReopening(org, reopeningId, r.approvals.length, { approvals, status: done ? "approved" : "pending" });
    if (!updated) throw new PeriodConflictError("O pedido mudou entretanto.", "invalid_state");
    if (done) await this.repo.setStatus(org, r.periodId, ["closed"], "reopened");
    await this.log(org, actor.email, done ? "periods.reopen.approved" : "periods.reopen.approve", r.periodId, r, updated, r.reason);
    return updated;
  }

  async rejectReopen(org: OrganizationId, actor: Actor, reopeningId: string, reason: string | null) {
    const r = await this.repo.getReopening(org, reopeningId);
    if (!r) throw new PeriodNotFoundError("Pedido de reabertura não encontrado.");
    if (r.status !== "pending") throw new PeriodConflictError("Este pedido já foi decidido.", "invalid_state");
    if (r.requestedByUserId === actor.userId) throw new PeriodForbiddenError("Quem pede a reabertura não a pode decidir.");
    const updated = await this.repo.updateReopening(org, reopeningId, r.approvals.length, { approvals: r.approvals, status: "rejected" });
    await this.log(org, actor.email, "periods.reopen.reject", r.periodId, r, updated, reason);
    return updated;
  }

  // ── Guarda das escritas (TK-17, RE-30) ──────────────────────────────
  /** Datas de [from, to] que estão num período fechado para este colaborador. */
  async closedDates(org: OrganizationId, employeeId: string, from: string, to: string): Promise<Set<string>> {
    const closed = (await this.repo.listPeriods(org)).filter((p) => p.status === "closed" && !(p.endDate < from || p.startDate > to));
    const out = new Set<string>();
    if (!closed.length) return out;
    for (let d = from; d <= to; d = plusDays(d, 1)) {
      const hits = closed.filter((p) => p.startDate <= d && d <= p.endDate);
      if (!hits.length) continue;
      if (hits.some((p) => p.scopeType === "organization")) {
        out.add(d);
        continue;
      }
      const locations = await this.ctx.employeeLocations(org, employeeId, d);
      if (hits.some((p) => p.scopeId !== null && locations.includes(p.scopeId))) out.add(d);
    }
    return out;
  }

  // ── Exportações assíncronas (centro de transferências) ──────────────
  async requestExport(org: OrganizationId, actor: Actor, periodId: string, kind: "payroll" | "billing_location", includeSensitive: boolean) {
    const p = await this.period(org, periodId);
    if (p.status !== "closed") throw new PeriodConflictError("Só se exporta um período fechado.", "invalid_state");
    if (kind !== "payroll" && kind !== "billing_location") throw new PeriodValidationError("Tipo de exportação inválido.", "kind");
    const job = await this.repo.insertExport(org, { periodId, kind, requestedBy: actor.email, requestedByUserId: actor.userId, includeSensitive });
    await this.log(org, actor.email, "periods.export.request", periodId, null, { jobId: job.id, kind, includeSensitive });
    this.support.background(() => this.runExport(org, job.id, p, kind, includeSensitive));
    return job;
  }

  async runExport(org: OrganizationId, jobId: string, p: PayPeriod, kind: "payroll" | "billing_location", includeSensitive: boolean) {
    try {
      await this.repo.updateExport(org, jobId, { status: "running" });
      const closure = (await this.repo.listClosures(org, p.id)).sort((a, b) => b.closureNo - a.closureNo)[0];
      if (!closure) throw new Error("Período sem fecho.");
      const people = await this.ctx.employeeInfo(org, closure.totals.map((t) => t.employeeId));
      let content: string;
      if (kind === "payroll") content = payrollCsv(p, closure.totals, people, includeSensitive);
      else {
        const names = new Map<string | null, string>();
        for (const l of new Set(closure.totals.flatMap((t) => t.byLocation.map((x) => x.locationId)))) names.set(l, await this.ctx.locationName(org, l));
        content = billingByLocationCsv(p, closure.totals, people, (id) => names.get(id) ?? "");
      }
      const expiresAt = DateTime.fromISO(this.support.now(), { zone: "utc" }).plus({ hours: EXPORT_TTL_HOURS }).toISO()!;
      await this.repo.updateExport(org, jobId, {
        status: "done",
        content,
        token: this.support.token(),
        fileName: `${kind === "payroll" ? "salarios" : "faturacao-centros"}_${p.startDate}_${p.endDate}.csv`,
        totals: sumTotals(closure.totals),
        expiresAt,
      });
    } catch (e) {
      await this.repo.updateExport(org, jobId, { status: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  }

  listMyExports(org: OrganizationId, actor: Actor) {
    return this.repo.listExports(org, actor.userId);
  }

  /** Link que expira: só quem pediu, com o token certo e dentro das 24 h. */
  async download(org: OrganizationId, actor: Actor, id: string, token: string) {
    const f = await this.repo.getExportFile(org, id);
    if (!f || f.job.requestedByUserId !== actor.userId || f.job.status !== "done" || !f.token || f.token !== token) throw new PeriodNotFoundError("Ficheiro não encontrado.");
    if (!f.job.expiresAt || this.support.now() > f.job.expiresAt) throw new PeriodConflictError("O link expirou. Peça a exportação de novo.", "expired");
    await this.log(org, actor.email, "periods.export.download", f.job.periodId, null, { jobId: id });
    return { fileName: f.job.fileName ?? "exportacao.csv", content: f.content ?? "" };
  }

  /** Token de um ficheiro pronto (para o link do centro de transferências). */
  async exportLink(org: OrganizationId, actor: Actor, id: string) {
    const f = await this.repo.getExportFile(org, id);
    if (!f || f.job.requestedByUserId !== actor.userId || f.job.status !== "done" || !f.token) throw new PeriodNotFoundError("Ficheiro não encontrado.");
    if (!f.job.expiresAt || this.support.now() > f.job.expiresAt) throw new PeriodConflictError("O link expirou. Peça a exportação de novo.", "expired");
    return { token: f.token, expiresAt: f.job.expiresAt };
  }
}

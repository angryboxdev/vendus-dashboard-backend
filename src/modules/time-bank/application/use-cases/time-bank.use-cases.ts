import { DateTime } from "luxon";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { validateCategory, type BankSettings, type HourCategoryInput, type NewEntry } from "../../domain/entities/time-bank.js";
import { TimeBankConflictError, TimeBankForbiddenError, TimeBankNotFoundError, TimeBankRuleError, TimeBankValidationError } from "../../domain/errors.js";
import type { TimeBankAuditPort, TimeBankContextPort, TimeBankRepositoryPort } from "../../domain/ports/out/time-bank.ports.js";
import { cutoff, dayTarget, postingsFor, running, secondsInCategory, summary, toExpire, type BankDay } from "../../domain/services/posting.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CHUNK = 31;
/** Janela da sincronização automática (ADR-0029). */
const AUTO_WINDOW_DAYS = 92;
const MAX_SYNC_DAYS = 366;
const plusDays = (d: string, n: number) => DateTime.fromISO(d, { zone: "utc" }).plus({ days: n }).toISODate()!;
const span = (a: string, b: string) => Math.round(DateTime.fromISO(b, { zone: "utc" }).diff(DateTime.fromISO(a, { zone: "utc" }), "days").days) + 1;

export interface Actor {
  userId: string;
  email: string;
}

export class TimeBankUseCases {
  constructor(
    private readonly repo: TimeBankRepositoryPort,
    private readonly ctx: TimeBankContextPort,
    private readonly audit: TimeBankAuditPort,
  ) {}

  private log(org: OrganizationId, actor: string, action: string, resourceId: string | null, after: unknown, reason: string | null) {
    return this.audit.record(org, { actor, action, resourceType: "time_bank", resourceId, before: null, after, reason });
  }

  /** Dias apurados por blocos de 31 (limite da assiduidade). */
  private async days(org: OrganizationId, employeeId: string, from: string, to: string): Promise<{ timeZone: string; days: BankDay[] }> {
    let timeZone = "Europe/Lisbon";
    const days: BankDay[] = [];
    for (let s = from; s <= to; s = plusDays(s, CHUNK)) {
      const e = plusDays(s, CHUNK - 1) < to ? plusDays(s, CHUNK - 1) : to;
      const r = await this.ctx.attendanceDays(org, employeeId, s, e);
      timeZone = r.timeZone;
      days.push(...r.days);
    }
    return { timeZone, days };
  }

  /**
   * Sincroniza o banco com a assiduidade até ao corte (D11). Append-only:
   * dias novos → movimento diário; dias alterados → ajuste de hoje (RE-29).
   * Cada dia usa os parâmetros em vigor nesse dia (CF-6).
   */
  async sync(org: OrganizationId, employeeId: string, by: string, range?: { from: string; to: string }): Promise<{ posted: number; cutoff: string }> {
    const today = await this.ctx.today(org);
    const nowSettings = await this.ctx.settingsAt(org, employeeId, today);
    const cut = cutoff(nowSettings.period, today);
    let from = range?.from ?? plusDays(cut, -(AUTO_WINDOW_DAYS - 1));
    let to = range?.to ?? cut;
    if (!DATE.test(from) || !DATE.test(to) || to < from) throw new TimeBankValidationError("Período inválido.", "from");
    if (to > cut) to = cut;
    if (from > to) return { posted: 0, cutoff: cut };
    if (span(from, to) > MAX_SYNC_DAYS) from = plusDays(to, -(MAX_SYNC_DAYS - 1));

    const [entries, validations, categories, att] = await Promise.all([
      this.repo.listEntries(org, employeeId),
      this.repo.listValidations(org, employeeId, from, to),
      this.repo.listCategories(org),
      this.days(org, employeeId, from, to),
    ]);
    const settingsCache = new Map<string, BankSettings>();
    const settingsAt = async (d: string) => {
      if (!settingsCache.has(d)) settingsCache.set(d, await this.ctx.settingsAt(org, employeeId, d));
      return settingsCache.get(d)!;
    };
    const fresh: NewEntry[] = [];
    for (const day of att.days) {
      if (day.workDate > cut) continue;
      const s = await settingsAt(day.workDate);
      const target = dayTarget(day, {
        timeZone: att.timeZone,
        validationRequired: s.excessValidation,
        validation: validations.find((v) => v.workDate === day.workDate)?.status ?? null,
        categories,
        holiday: s.holidayMode === "hours" ? await this.ctx.holidayOn(org, employeeId, day.workDate) : null,
        holidayMode: s.holidayMode,
      });
      for (const p of postingsFor(day.workDate, target, entries, today, by)) fresh.push({ ...p, employeeId });
    }
    const inserted = fresh.length ? await this.repo.insertEntries(org, fresh) : [];
    // Expiração (as mais antigas primeiro; negativas nunca expiram).
    const all = [...entries, ...inserted];
    const expire = toExpire(all, today, nowSettings.expiryDays);
    if (expire > 0) inserted.push(...(await this.repo.insertEntries(org, [{ employeeId, kind: "expiry", seconds: -expire, workDate: today, postedOn: today, paymentMonth: null, reason: `Horas com mais de ${nowSettings.expiryDays} dias`, createdBy: by }])));
    return { posted: inserted.length, cutoff: cut };
  }

  /** Ledger com acumulado (RE-26) e resumo; sincroniza antes (RE-27: só até ao corte). */
  async ledger(org: OrganizationId, employeeId: string, by: string) {
    const { cutoff: cut } = await this.sync(org, employeeId, by);
    const entries = await this.repo.listEntries(org, employeeId);
    const today = await this.ctx.today(org);
    const validationDays = await this.pendingValidations(org, employeeId);
    const s = await this.ctx.settingsAt(org, employeeId, today);
    const totals = summary(entries);
    return {
      employeeId,
      cutoff: cut,
      today,
      ...totals,
      available: totals.balance,
      compensateBeyondBalance: s.compensateBeyondBalance,
      pendingValidation: validationDays,
      entries: running(entries),
    };
  }

  async myLedger(org: OrganizationId, actor: Actor) {
    const employeeId = await this.ctx.employeeForUser(org, actor.userId);
    if (!employeeId) throw new TimeBankNotFoundError("Esta conta não está ligada a uma ficha de colaborador.");
    const s = await this.ctx.settingsAt(org, employeeId, await this.ctx.today(org));
    if (!s.employeeSeesHistory) throw new TimeBankRuleError("O histórico do banco de horas não está visível para os colaboradores.", "not_visible");
    return this.ledger(org, employeeId, "sistema");
  }

  /**
   * Compensar em descanso ou pago (F-06.2). RE-28: nunca mais do que o
   * disponível (salvo política) nem acima do limite anual de horas pagas.
   */
  async compensate(org: OrganizationId, actor: Actor, employeeId: string, input: { mode: "rest" | "paid"; seconds: number; paymentMonth: string | null; reason: string }) {
    if (input.mode !== "rest" && input.mode !== "paid") throw new TimeBankValidationError("Indique descanso ou pagamento.", "mode");
    if (!Number.isInteger(input.seconds) || input.seconds <= 0) throw new TimeBankValidationError("Indique as horas a compensar.", "seconds");
    if (!input.reason?.trim()) throw new TimeBankValidationError("Indique o motivo.", "reason");
    if (input.mode === "paid" && (!input.paymentMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.paymentMonth))) throw new TimeBankValidationError("Indique o mês de pagamento.", "paymentMonth");
    if ((await this.ctx.employeeForUser(org, actor.userId)) === employeeId) throw new TimeBankForbiddenError("Não pode compensar o seu próprio banco de horas.");
    await this.sync(org, employeeId, actor.email);
    const today = await this.ctx.today(org);
    const s = await this.ctx.settingsAt(org, employeeId, today);
    const entries = await this.repo.listEntries(org, employeeId);
    const available = summary(entries).balance;
    if (input.seconds > available && !s.compensateBeyondBalance) {
      throw new TimeBankRuleError(`Só há ${Math.max(0, available)} s disponíveis para compensar.`, "exceeds_balance", { availableSeconds: Math.max(0, available) });
    }
    if (input.mode === "paid" && s.paidAnnualLimitHours !== null && !s.paidAfterLimit) {
      const year = input.paymentMonth!.slice(0, 4);
      const paid = -entries.filter((e) => e.kind === "compensation_paid" && e.paymentMonth?.startsWith(year)).reduce((acc, e) => acc + e.seconds, 0);
      const limit = s.paidAnnualLimitHours * 3600;
      if (paid + input.seconds > limit) throw new TimeBankRuleError("Ultrapassa o limite anual de horas pagas.", "paid_limit", { remainingSeconds: Math.max(0, limit - paid) });
    }
    const [e] = await this.repo.insertEntries(org, [
      {
        employeeId,
        kind: input.mode === "rest" ? "compensation_rest" : "compensation_paid",
        seconds: -input.seconds,
        workDate: today,
        postedOn: today,
        paymentMonth: input.mode === "paid" ? input.paymentMonth : null,
        reason: input.reason.trim(),
        createdBy: actor.email,
      },
    ]);
    await this.log(org, actor.email, `time_bank.compensate.${input.mode}`, employeeId, e, input.reason);
    return e;
  }

  /** Ajuste manual, com motivo; datado de hoje e com referência a um dia (opcional). */
  async adjust(org: OrganizationId, actor: Actor, employeeId: string, input: { seconds: number; workDate: string | null; reason: string }) {
    if (!Number.isInteger(input.seconds) || input.seconds === 0 || Math.abs(input.seconds) > 1000 * 3600) throw new TimeBankValidationError("Quantidade inválida.", "seconds");
    if (!input.reason?.trim()) throw new TimeBankValidationError("Indique o motivo do ajuste.", "reason");
    if (input.workDate !== null && !DATE.test(input.workDate)) throw new TimeBankValidationError("Dia inválido.", "workDate");
    if ((await this.ctx.employeeForUser(org, actor.userId)) === employeeId) throw new TimeBankForbiddenError("Não pode ajustar o seu próprio banco de horas.");
    const today = await this.ctx.today(org);
    const [e] = await this.repo.insertEntries(org, [{ employeeId, kind: "adjustment", seconds: input.seconds, workDate: input.workDate ?? today, postedOn: today, paymentMonth: null, reason: input.reason.trim(), createdBy: actor.email }]);
    await this.log(org, actor.email, "time_bank.adjust", employeeId, e, input.reason);
    return e;
  }

  // ── Validação de excedente (C6.5, CF-6) ─────────────────────────────
  /** Dias até ao corte com excedente por validar (validação em vigor nesse dia e sem decisão). */
  async pendingValidations(org: OrganizationId, employeeId: string): Promise<{ workDate: string; excessSeconds: number }[]> {
    const today = await this.ctx.today(org);
    const cut = cutoff((await this.ctx.settingsAt(org, employeeId, today)).period, today);
    const from = plusDays(cut, -(AUTO_WINDOW_DAYS - 1));
    const [att, validations] = await Promise.all([this.days(org, employeeId, from, cut), this.repo.listValidations(org, employeeId, from, cut)]);
    const out: { workDate: string; excessSeconds: number }[] = [];
    for (const d of att.days) {
      if (d.excessSeconds <= 0 || validations.some((v) => v.workDate === d.workDate)) continue;
      if ((await this.ctx.settingsAt(org, employeeId, d.workDate)).excessValidation) out.push({ workDate: d.workDate, excessSeconds: d.excessSeconds });
    }
    return out;
  }

  async decideValidation(org: OrganizationId, actor: Actor, employeeId: string, workDate: string, decision: "approve" | "reject", comment: string | null) {
    if (!DATE.test(workDate)) throw new TimeBankValidationError("Dia inválido.", "workDate");
    if ((await this.ctx.employeeForUser(org, actor.userId)) === employeeId) throw new TimeBankForbiddenError("Não pode validar o seu próprio excedente.");
    if (!(await this.ctx.settingsAt(org, employeeId, workDate)).excessValidation) throw new TimeBankConflictError("Este dia não precisa de validação.", "not_required");
    if (decision === "reject" && !comment?.trim()) throw new TimeBankValidationError("Indique o motivo da recusa.", "comment");
    const v = await this.repo.insertValidation(org, { employeeId, workDate, status: decision === "approve" ? "approved" : "rejected", comment: comment?.trim() || null, decidedBy: actor.email });
    if (!v) throw new TimeBankConflictError("Este dia já foi decidido.", "already_decided");
    await this.log(org, actor.email, `time_bank.validation.${decision}`, employeeId, v, comment);
    await this.sync(org, employeeId, actor.email, { from: workDate, to: workDate });
    return v;
  }

  // ── Horas categorizadas (C4.6) ──────────────────────────────────────
  listCategories(org: OrganizationId) {
    return this.repo.listCategories(org);
  }

  async createCategory(org: OrganizationId, actor: Actor, input: HourCategoryInput) {
    validateCategory(input);
    const lower = input.name.trim().toLocaleLowerCase("pt");
    if ((await this.repo.listCategories(org)).some((c) => !c.archived && c.name.toLocaleLowerCase("pt") === lower)) throw new TimeBankConflictError("Já existe uma categoria com este nome.", "duplicate_name");
    const c = await this.repo.createCategory(org, { ...input, name: input.name.trim() }, actor.email);
    await this.log(org, actor.email, "time_bank.category.create", c.id, c, null);
    return c;
  }

  async archiveCategory(org: OrganizationId, actor: Actor, id: string) {
    if (!(await this.repo.listCategories(org)).some((c) => c.id === id && !c.archived)) throw new TimeBankNotFoundError("Categoria não encontrada.");
    await this.repo.archiveCategory(org, id);
    await this.log(org, actor.email, "time_bank.category.archive", id, null, null);
  }

  /** Relatório "Horas categorizadas": segundos trabalhados em cada categoria no período. */
  async categorized(org: OrganizationId, employeeId: string, from: string, to: string) {
    if (!DATE.test(from) || !DATE.test(to) || to < from || span(from, to) > 92) throw new TimeBankValidationError("Período inválido (máx. 92 dias).", "from");
    const [categories, att] = await Promise.all([this.repo.listCategories(org), this.days(org, employeeId, from, to)]);
    return categories
      .filter((c) => !c.archived)
      .map((c) => ({ categoryId: c.id, name: c.name, factor: c.factor, seconds: att.days.reduce((s, d) => s + secondsInCategory(d, c, att.timeZone), 0) }));
  }
}

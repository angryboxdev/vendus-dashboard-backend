import { randomUUID } from "node:crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import {
  AssistantError,
  type AppliedBatch,
  type AssistantContext,
  type AssistantReply,
  type AssistantScreenContext,
  type ChangePlan,
  type ChatTurn,
  type EmployeeView,
  type NewShift,
  type ShiftView,
  type TemplateView,
  type Viewer,
} from "../../domain/entities/assistant.js";
import { SchedulingBlockedError, type AssistantAuditPort, type LlmMessage, type LlmPort, type LlmToolCall, type SchedulingPort, type TranscriberPort, type Violation } from "../../domain/ports/out/assistant.ports.js";
import {
  DATE,
  HM,
  confirmationSummary,
  dayLabel,
  employeeForModel,
  expandDates,
  fingerprint,
  hoursLabel,
  matchByName,
  needsConfirmation,
  planFacts,
  sameSegments,
  shiftMinutes,
  weekdayName,
} from "../../domain/services/assistant.service.js";
import { TOOLS, TOOL_NAMES, systemPrompt, type ToolName } from "../../domain/services/tools.js";

export const MAX_STEPS = 6;
export const MAX_MESSAGE = 1000;
export const MAX_HISTORY = 12;
export const MAX_TURN_CHARS = 2000;
export const MAX_PERIOD_DAYS = 62;
export const CONFIRM_TTL_MS = 10 * 60_000;
export const UNAVAILABLE = "O Assistente Mezza está temporariamente indisponível. Pode continuar a editar a escala normalmente.";
const NO_DATA = "Não tenho dados suficientes para confirmar isso.";

const span = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;
const fmtMinutes = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;

/** Erro de uma ferramenta: volta à IA como resultado (não rebenta o pedido). */
class ToolProblem extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

interface PendingAction {
  token: string;
  org: OrganizationId;
  userId: string;
  screen: AssistantScreenContext;
  plan: ChangePlan;
  print: string;
  rosterVersion: number;
  expiresAt: number;
  names: Map<string, string>;
}

/** Estado de um pedido de conversa: refs curtas (e1, s1, m1) e o que foi feito. */
class Session {
  private employees_: EmployeeView[] | null = null;
  private templates_: TemplateView[] | null = null;
  private shiftCache = new Map<string, ShiftView[]>();
  private readonly eRef = new Map<string, string>();
  private readonly sRef = new Map<string, ShiftView>();
  private readonly mRef = new Map<string, TemplateView>();
  private readonly refOfEmployee = new Map<string, string>();
  readonly applied: AppliedBatch = { label: "", created: [], removed: [], from: "", to: "" };
  readonly facts: string[] = [];
  readonly labels: string[] = [];
  confirmation: { token: string; summary: string } | null = null;
  publishFlow = false;

  constructor(
    private readonly uc: AssistantUseCases,
    readonly org: OrganizationId,
    readonly viewer: Viewer,
    readonly ctx: AssistantContext,
  ) {}

  private get s() {
    return this.uc.scheduling;
  }

  async employees(): Promise<EmployeeView[]> {
    if (!this.employees_) {
      const all = await this.s.employees(this.org, this.ctx.rosterId);
      const ok = await Promise.all(all.map((e) => this.viewer.canSee(e.id, this.ctx.today)));
      this.employees_ = all.filter((_, i) => ok[i]);
      this.employees_.forEach((e, i) => {
        this.eRef.set(`e${i + 1}`, e.id);
        this.refOfEmployee.set(e.id, `e${i + 1}`);
      });
    }
    return this.employees_;
  }

  async names(): Promise<Map<string, string>> {
    return new Map((await this.employees()).map((e) => [e.id, e.name]));
  }

  refOf(employeeId: string): string {
    return this.refOfEmployee.get(employeeId) ?? "?";
  }

  async templates(): Promise<TemplateView[]> {
    if (!this.templates_) {
      this.templates_ = await this.s.templates(this.org);
      this.templates_.forEach((t, i) => this.mRef.set(`m${i + 1}`, t));
    }
    return this.templates_;
  }

  async shifts(from: string, to: string): Promise<ShiftView[]> {
    const key = `${from}|${to}`;
    if (!this.shiftCache.has(key)) {
      const visible = new Set((await this.employees()).map((e) => e.id));
      const list = (await this.s.shifts(this.org, this.ctx.rosterId, from, to)).filter((x) => visible.has(x.employeeId)).sort((a, b) => a.workDate.localeCompare(b.workDate) || a.employeeId.localeCompare(b.employeeId));
      for (const x of list) if (![...this.sRef.values()].some((v) => v.id === x.id)) this.sRef.set(`s${this.sRef.size + 1}`, x);
      this.shiftCache.set(key, list);
    }
    return this.shiftCache.get(key)!;
  }

  shiftRefOf(id: string): string {
    return [...this.sRef].find(([, v]) => v.id === id)?.[0] ?? "?";
  }

  invalidateShifts() {
    this.shiftCache.clear();
  }

  // ── Resolução (sem adivinhar) ─────────────────────────────────────────
  async employee(arg: unknown): Promise<EmployeeView> {
    const q = typeof arg === "string" ? arg.trim() : "";
    if (!q) throw new ToolProblem("missing_employee", "Indique o colaborador.");
    const list = await this.employees();
    const byRef = this.eRef.get(q);
    if (byRef) return list.find((e) => e.id === byRef)!;
    const m = matchByName(q, list);
    if (m.kind === "one") return m.item;
    if (m.kind === "ambiguous") throw new ToolProblem("ambiguous_employee", `Há ${m.items.length} colaboradores com esse nome. Pergunte qual.`, { candidates: m.items.map((e) => ({ ref: this.refOf(e.id), name: e.name, position: e.positionName })) });
    throw new ToolProblem("employee_not_found", `Não encontrei "${q}" nesta escala.`);
  }

  async model(arg: unknown): Promise<TemplateView> {
    const q = typeof arg === "string" ? arg.trim() : "";
    const list = await this.templates();
    const byRef = this.mRef.get(q);
    if (byRef) return byRef;
    const m = matchByName(q, list);
    if (m.kind === "one") return m.item;
    if (m.kind === "ambiguous") throw new ToolProblem("ambiguous_model", "Há vários modelos com esse nome. Pergunte qual.", { candidates: m.items.map((t) => t.name) });
    throw new ToolProblem("model_not_found", `Não existe o modelo "${q}".`);
  }

  async shift(arg: unknown): Promise<ShiftView> {
    const q = typeof arg === "string" ? arg.trim() : "";
    const hit = this.sRef.get(q);
    if (!hit) throw new ToolProblem("unknown_shift", "Turno desconhecido: consulte primeiro QUERY_SCHEDULE e use a ref (s1…).");
    return hit;
  }

  period(from: unknown, to: unknown): { from: string; to: string } {
    const f = typeof from === "string" && from ? from : this.ctx.from;
    const t = typeof to === "string" && to ? to : f === this.ctx.from ? this.ctx.to : f;
    if (!DATE.test(f) || !DATE.test(t) || t < f) throw new ToolProblem("invalid_period", "Período inválido.");
    if (span(f, t) > MAX_PERIOD_DAYS) throw new ToolProblem("invalid_period", `No máximo ${MAX_PERIOD_DAYS} dias.`);
    return { from: f, to: t };
  }

  async segments(a: Record<string, unknown>): Promise<{ templateId: string | null; segments: { start: string; end: string }[]; label: string }> {
    if (typeof a.model === "string" && a.model.trim()) {
      const t = await this.model(a.model);
      return { templateId: t.id, segments: t.segments, label: t.name };
    }
    if (typeof a.start === "string" && typeof a.end === "string") {
      if (!HM.test(a.start) || !HM.test(a.end) || a.start === a.end) throw new ToolProblem("invalid_hours", "Horas inválidas (use HH:MM).");
      return { templateId: null, segments: [{ start: a.start, end: a.end }], label: `${a.start}–${a.end}` };
    }
    throw new ToolProblem("missing_hours", "Falta o modelo ou as horas do turno.");
  }

  // ── Ferramentas ──────────────────────────────────────────────────────
  async run(call: LlmToolCall): Promise<unknown> {
    if (!TOOL_NAMES.has(call.name)) return { error: "unknown_tool", message: "Comando não permitido." };
    if (this.confirmation) return { error: "awaiting_confirmation", message: "Há uma alteração à espera de confirmação; não faça mais alterações agora." };
    let args: Record<string, unknown>;
    try {
      const parsed: unknown = call.arguments ? JSON.parse(call.arguments) : {};
      args = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return { error: "invalid_arguments", message: "Argumentos inválidos." };
    }
    const def = TOOLS.find((t) => t.name === call.name)!;
    if (def.write && !this.viewer.canWrite) return { error: "forbidden", message: "Sem permissão para alterar a escala (só consulta)." };
    try {
      return await this.dispatch(call.name as ToolName, args);
    } catch (e) {
      if (e instanceof ToolProblem) return { error: e.code, message: e.message, ...e.extra };
      if (e instanceof SchedulingBlockedError) {
        const names = await this.names();
        return { error: "blocked", message: "A escala recusou a alteração.", conflicts: e.violations.slice(0, 10).map((v) => `${names.get(v.employeeId) ?? "colaborador"} (${dayLabel(v.workDate)}): ${privateSafe(v)}`) };
      }
      if (e instanceof AssistantError && e.code !== "unavailable") return { error: e.code, message: e.message };
      throw e;
    }
  }

  private async dispatch(name: ToolName, a: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case "QUERY_EMPLOYEES": {
        const list = await this.employees();
        const byName = typeof a.name === "string" && a.name.trim() ? matchByName(a.name, list) : null;
        let rows = byName ? (byName.kind === "one" ? [byName.item] : byName.kind === "ambiguous" ? byName.items : []) : [...list].sort((x, y) => Number(y.member) - Number(x.member));
        if (typeof a.position === "string" && a.position.trim()) rows = rows.filter((e) => e.positionName && matchByName(a.position as string, [{ name: e.positionName }]).kind !== "none");
        return { employees: rows.slice(0, 200).map((e) => employeeForModel(e, this.refOf(e.id))), total: rows.length };
      }
      case "QUERY_SHIFT_MODELS": {
        const list = await this.templates();
        return { models: list.map((t) => ({ ref: [...this.mRef].find(([, v]) => v.id === t.id)![0], name: t.name, abbreviation: t.abbreviation, hours: hoursLabel(t.segments) })) };
      }
      case "QUERY_SCHEDULE": {
        const p = this.period(a.from, a.to);
        let list = await this.shifts(p.from, p.to);
        if (typeof a.employee === "string" && a.employee.trim()) {
          const e = await this.employee(a.employee);
          list = list.filter((x) => x.employeeId === e.id);
        }
        const names = await this.names();
        const templates = new Map((await this.templates()).map((t) => [t.id, t.name]));
        const minutes = new Map<string, number>();
        for (const x of list) if (x.kind === "shift") minutes.set(x.employeeId, (minutes.get(x.employeeId) ?? 0) + shiftMinutes(x.segments));
        return {
          period: { from: p.from, to: p.to },
          shifts: list.slice(0, 300).map((x) => ({
            ref: this.shiftRefOf(x.id),
            employee: names.get(x.employeeId),
            employeeRef: this.refOf(x.employeeId),
            date: x.workDate,
            weekday: weekdayName(x.workDate),
            hours: hoursLabel(x.segments),
            model: x.templateId ? (templates.get(x.templateId) ?? null) : null,
            state: x.pendingOnly ? "rascunho" : "publicado",
          })),
          truncated: list.length > 300,
          plannedHours: [...minutes].map(([id, m]) => ({ employee: names.get(id), hours: fmtMinutes(m) })),
        };
      }
      case "QUERY_AVAILABILITY": {
        if (typeof a.date !== "string" || !DATE.test(a.date)) throw new ToolProblem("invalid_date", "Data inválida.");
        const seg = await this.segments(a);
        const all = await this.employees();
        // Candidatos: quem é desta escala (local ou já com turnos nela); sem membros, todos os visíveis.
        let list = all.some((e) => e.member) ? all.filter((e) => e.member) : all;
        if (typeof a.position === "string" && a.position.trim()) list = list.filter((e) => e.positionName && matchByName(a.position as string, [{ name: e.positionName }]).kind !== "none");
        if (typeof a.exclude === "string" && a.exclude.trim()) {
          const ex = await this.employee(a.exclude);
          list = list.filter((e) => e.id !== ex.id);
        }
        const res = await this.s.availability(this.org, this.ctx.rosterId, { workDate: a.date, segments: seg.segments, employeeIds: list.map((e) => e.id) });
        const names = await this.names();
        const who = (id: string) => ({ ref: this.refOf(id), name: names.get(id) });
        return {
          date: a.date,
          weekday: weekdayName(a.date),
          hours: hoursLabel(seg.segments),
          available: res.filter((r) => r.status === "available").map((r) => who(r.employeeId)),
          withWarnings: res.filter((r) => r.status === "warning").map((r) => ({ ...who(r.employeeId), reasons: r.reasons.map(privateSafe) })),
          unavailable: res.filter((r) => r.status === "blocked").map((r) => ({ ...who(r.employeeId), reasons: r.reasons.filter((v) => v.severity === "block").map(privateSafe) })),
        };
      }
      case "QUERY_COVERAGE": {
        const p = this.period(a.from, a.to);
        const gaps = await this.s.coverage(this.org, this.ctx.rosterId, (await this.employees()).filter((e) => e.member), p.from, p.to);
        const names = await this.names();
        return { period: p, uncovered: gaps.length, gaps: gaps.slice(0, 100).map((g) => ({ employee: names.get(g.employeeId), ref: this.refOf(g.employeeId), date: g.date, weekday: weekdayName(g.date), hours: g.segments.length ? hoursLabel(g.segments) : "sem horário definido" })) };
      }
      case "QUERY_CONFLICTS": {
        const c = await this.s.conflicts(this.org, this.ctx.rosterId);
        const names = await this.names();
        const line = (v: Violation) => `${names.get(v.employeeId) ?? "colaborador"} (${dayLabel(v.workDate)}): ${privateSafe(v)}`;
        return { pending: c.pending, blocks: c.violations.filter((v) => v.severity === "block").slice(0, 20).map(line), warnings: c.violations.filter((v) => v.severity === "warning").slice(0, 20).map(line) };
      }
      case "START_PUBLISH": {
        const c = await this.s.conflicts(this.org, this.ctx.rosterId);
        this.publishFlow = true;
        const blocks = c.violations.filter((v) => v.severity === "block").length;
        return { pending: c.pending, blocks, warnings: c.violations.length - blocks, message: c.pending ? "O ecrã vai abrir a publicação para rever e confirmar (a IA não publica)." : "Não há alterações por publicar." };
      }
      case "CREATE_SHIFTS": {
        const items = Array.isArray(a.items) ? (a.items as Record<string, unknown>[]) : [];
        if (!items.length) throw new ToolProblem("missing_items", "Indique os turnos a criar.");
        const creates: NewShift[] = [];
        for (const it of items) {
          const e = await this.employee(it.employee);
          const seg = await this.segments(it);
          let dates: string[];
          if (typeof it.date === "string") {
            if (!DATE.test(it.date)) throw new ToolProblem("invalid_date", "Data inválida.");
            dates = [it.date];
          } else {
            const p = this.period(it.from, it.to);
            const wd = Array.isArray(it.weekdays) ? (it.weekdays as unknown[]).map(Number).filter((n) => n >= 1 && n <= 7) : [];
            dates = expandDates(p.from, p.to, wd, MAX_PERIOD_DAYS);
          }
          for (const d of dates) creates.push({ employeeId: e.id, workDate: d, templateId: seg.templateId, segments: seg.segments });
        }
        return this.apply({ command: "CREATE_SHIFTS", label: creates.length > 1 ? "ASSIGN_SHIFTS_BATCH" : "ASSIGN_SHIFT", creates, removes: [], skipped: [] });
      }
      case "REMOVE_SHIFTS": {
        let targets: ShiftView[] = [];
        if (Array.isArray(a.shifts) && a.shifts.length) for (const r of a.shifts) targets.push(await this.shift(r));
        else if (typeof a.employee === "string") {
          const e = await this.employee(a.employee);
          const p = this.period(a.from, a.to);
          targets = (await this.shifts(p.from, p.to)).filter((x) => x.employeeId === e.id);
        } else throw new ToolProblem("missing_target", "Indique os turnos (refs) ou o colaborador e o período.");
        const names = await this.names();
        const published = targets.filter((x) => !x.pendingOnly);
        return this.apply({
          command: "REMOVE_SHIFTS",
          label: "REMOVE_SHIFTS",
          creates: [],
          removes: targets.filter((x) => x.pendingOnly),
          skipped: published.map((x) => ({ what: `${names.get(x.employeeId)} ${dayLabel(x.workDate)}`, reason: "turno publicado — altere no ecrã, com motivo" })),
        });
      }
      case "UPDATE_SHIFT": {
        const cur = await this.shift(a.shift);
        if (!cur.pendingOnly) throw new ToolProblem("published", "Este turno está publicado: não se altera por aqui. Use a alteração no ecrã (com motivo).");
        const employee = typeof a.employee === "string" && a.employee.trim() ? await this.employee(a.employee) : null;
        const hasHours = (typeof a.model === "string" && a.model.trim()) || (typeof a.start === "string" && typeof a.end === "string");
        const seg = hasHours ? await this.segments(a) : { templateId: cur.templateId, segments: cur.segments };
        if (typeof a.date === "string" && !DATE.test(a.date)) throw new ToolProblem("invalid_date", "Data inválida.");
        const next: NewShift = { employeeId: employee?.id ?? cur.employeeId, workDate: typeof a.date === "string" ? a.date : cur.workDate, templateId: seg.templateId, segments: seg.segments };
        if (next.employeeId === cur.employeeId && next.workDate === cur.workDate && sameSegments(next.segments, cur.segments)) throw new ToolProblem("no_change", "O turno já está assim.");
        const label = employee && employee.id !== cur.employeeId ? "REPLACE_EMPLOYEE" : next.workDate !== cur.workDate ? "MOVE_SHIFT" : "UPDATE_SHIFT";
        return this.apply({ command: "UPDATE_SHIFT", label, creates: [next], removes: [cur], skipped: [] });
      }
      case "SWAP_SHIFTS": {
        const x = await this.shift(a.a);
        const y = await this.shift(a.b);
        if (!x.pendingOnly || !y.pendingOnly) throw new ToolProblem("published", "Só se trocam turnos não publicados.");
        if (x.employeeId === y.employeeId) throw new ToolProblem("same_employee", "Os dois turnos são da mesma pessoa.");
        return this.apply({
          command: "SWAP_SHIFTS",
          label: "SWAP_SHIFTS",
          removes: [x, y],
          creates: [
            { employeeId: y.employeeId, workDate: x.workDate, templateId: x.templateId, segments: x.segments },
            { employeeId: x.employeeId, workDate: y.workDate, templateId: y.templateId, segments: y.segments },
          ],
          skipped: [],
        });
      }
      case "CREATE_SHIFT_MODEL": {
        const name = typeof a.name === "string" ? a.name.trim() : "";
        const segs = Array.isArray(a.segments) ? (a.segments as Record<string, unknown>[]).map((s) => ({ start: String(s?.start ?? ""), end: String(s?.end ?? "") })) : [];
        if (!name) throw new ToolProblem("missing_name", "Indique o nome do modelo.");
        if (!segs.length || segs.some((s) => !HM.test(s.start) || !HM.test(s.end))) throw new ToolProblem("invalid_hours", "Horas inválidas (use HH:MM).");
        const list = await this.templates();
        const same = list.find((t) => sameSegments(t.segments, segs));
        if (same && a.force !== true) return { exists: true, model: same.name, message: `Já existe um modelo equivalente chamado "${same.name}". Quer utilizar esse modelo ou criar outro?` };
        if (list.some((t) => matchByName(name, [t]).kind === "one" && t.name.toLowerCase() === name.toLowerCase())) throw new ToolProblem("duplicate_name", `Já existe um modelo chamado "${name}".`);
        const abbreviation = typeof a.abbreviation === "string" && a.abbreviation.trim() ? a.abbreviation.trim().slice(0, 4) : name.replace(/[^\p{L}]/gu, "").slice(0, 3);
        const t = await this.s.createTemplate(this.org, this.viewer, { name, abbreviation, segments: segs });
        this.templates_ = null;
        this.facts.push(`Modelo "${t.name}" criado (${hoursLabel(t.segments)}).`);
        await this.uc.audit.record(this.org, { actor: this.viewer.email, command: "CREATE_SHIFT_MODEL", structured: { name, segments: segs }, affectedIds: [t.id], result: "done", message: null });
        return { created: true, model: t.name, hours: hoursLabel(t.segments) };
      }
      case "FILL_COVERAGE": {
        const p = this.period(a.from, a.to);
        const gaps = await this.s.coverage(this.org, this.ctx.rosterId, (await this.employees()).filter((e) => e.member), p.from, p.to);
        const names = await this.names();
        const creates: NewShift[] = [];
        const skipped: ChangePlan["skipped"] = [];
        for (const g of gaps) {
          const what = `${names.get(g.employeeId)} ${dayLabel(g.date)}`;
          if (!g.segments.length) {
            skipped.push({ what, reason: "sem horário definido (indique as horas)" });
            continue;
          }
          const [r] = await this.s.availability(this.org, this.ctx.rosterId, { workDate: g.date, segments: g.segments, employeeIds: [g.employeeId] });
          if (r && r.status === "blocked") skipped.push({ what, reason: r.reasons.filter((v) => v.severity === "block").map(privateSafe).join("; ") || "regras da escala" });
          else creates.push({ employeeId: g.employeeId, workDate: g.date, templateId: null, segments: g.segments });
        }
        if (!gaps.length) return { done: false, message: "Não há turnos sem cobertura neste período." };
        return this.apply({ command: "FILL_COVERAGE", label: "FILL_COVERAGE", creates, removes: [], skipped });
      }
      case "CLEAR_PENDING_SHIFTS": {
        const p = this.period(a.from, a.to);
        let list = (await this.shifts(p.from, p.to)).filter((x) => x.pendingOnly);
        if (Array.isArray(a.employees) && a.employees.length) {
          const ids = new Set<string>();
          for (const e of a.employees) ids.add((await this.employee(e)).id);
          list = list.filter((x) => ids.has(x.employeeId));
        }
        if (!list.length) return { done: false, message: "Não há turnos por publicar neste período." };
        return this.apply({ command: "CLEAR_PENDING", label: "CLEAR_PENDING_SHIFTS", creates: [], removes: list, skipped: [] });
      }
    }
  }

  /** Executa (ou pede confirmação) uma alteração lógica — sempre pelos serviços das Escalas. */
  async apply(plan: ChangePlan, confirmed = false): Promise<unknown> {
    const visible = new Set((await this.employees()).map((e) => e.id));
    if ([...plan.creates, ...plan.removes].some((x) => !visible.has(x.employeeId))) throw new ToolProblem("forbidden", "Fora do seu âmbito.");
    const names = await this.names();
    if (!plan.creates.length && !plan.removes.length) {
      this.facts.push(...planFacts(plan, names));
      return { done: false, message: "Nada a alterar.", skipped: plan.skipped };
    }
    if (!confirmed && needsConfirmation(plan)) {
      const token = this.uc.newToken();
      this.uc.remember({ token, org: this.org, userId: this.viewer.userId, screen: this.ctx, plan, print: fingerprint(plan.removes), rosterVersion: this.ctx.rosterVersion, expiresAt: this.uc.now() + CONFIRM_TTL_MS, names });
      const summary = confirmationSummary(plan, names);
      this.confirmation = { token, summary };
      await this.uc.audit.record(this.org, { actor: this.viewer.email, command: plan.command, structured: summarize(plan), affectedIds: plan.removes.map((r) => r.id), result: "confirmation_requested", message: null });
      return { status: "confirmation_required", summary, message: "Pedi confirmação à pessoa; não diga que foi feito." };
    }
    const applied = await this.uc.execute(this.org, this.viewer, this.ctx.rosterId, plan);
    this.invalidateShifts();
    this.applied.created.push(...applied.created);
    this.applied.removed.push(...applied.removed);
    this.labels.push(plan.label);
    const facts = planFacts(plan, names);
    this.facts.push(...facts);
    return { done: true, created: applied.created.length, removed: applied.removed.length, summary: facts, warnings: applied.warnings.slice(0, 5).map((v) => `${names.get(v.employeeId) ?? "colaborador"} (${dayLabel(v.workDate)}): ${privateSafe(v)}`) };
  }
}

/** Ausências: nunca o motivo — só "Indisponível". */
function privateSafe(v: Violation): string {
  return v.rule === "absence" ? "Indisponível (ausência aprovada)" : v.message;
}

function summarize(plan: ChangePlan) {
  return { command: plan.command, label: plan.label, creates: plan.creates.map((c) => ({ employeeId: c.employeeId, workDate: c.workDate, segments: c.segments, templateId: c.templateId })), removes: plan.removes.map((r) => r.id), skipped: plan.skipped.length };
}

/**
 * Assistente Mezza: a IA interpreta, o backend valida e executa com os
 * serviços canónicos das Escalas. Consultas sem confirmação; alterações
 * explícitas e pequenas executam logo; grandes ou destrutivas pedem
 * confirmação; turnos publicados nunca se alteram por aqui; nunca publica.
 */
export class AssistantUseCases {
  private readonly pending = new Map<string, PendingAction>();

  constructor(
    private readonly llm: LlmPort | null,
    readonly scheduling: SchedulingPort,
    readonly audit: AssistantAuditPort,
    private readonly transcriber: TranscriberPort | null = null,
    readonly now: () => number = () => Date.now(),
    readonly newToken: () => string = () => randomUUID(),
  ) {}

  get available(): boolean {
    return !!this.llm;
  }

  remember(p: PendingAction) {
    for (const [k, v] of this.pending) if (v.expiresAt <= this.now()) this.pending.delete(k);
    this.pending.set(p.token, p);
  }

  async context(org: OrganizationId, screen: AssistantScreenContext): Promise<AssistantContext> {
    if (!screen.rosterId) throw new AssistantError("Abra uma escala.", "validation");
    if (!DATE.test(screen.from) || !DATE.test(screen.to) || screen.to < screen.from || span(screen.from, screen.to) > MAX_PERIOD_DAYS) throw new AssistantError("Período inválido.", "validation");
    const roster = await this.scheduling.roster(org, screen.rosterId);
    if (!roster) throw new AssistantError("Escala não encontrada.", "not_found");
    const [timeZone, today, shifts] = await Promise.all([this.scheduling.timeZone(org), this.scheduling.today(org), this.scheduling.shifts(org, screen.rosterId, screen.from, screen.to)]);
    return { ...screen, rosterName: roster.name, rosterVersion: roster.version, timeZone, today, pending: shifts.filter((s) => s.pendingOnly).length };
  }

  /** Executa um plano: retira pendentes e cria os novos; se a criação falhar, repõe o que retirou. */
  async execute(org: OrganizationId, viewer: Viewer, rosterId: string, plan: ChangePlan) {
    const removed = plan.removes.length ? await this.scheduling.removePending(org, viewer, rosterId, plan.removes) : [];
    let created: ShiftView[] = [];
    let warnings: Violation[] = [];
    try {
      if (plan.creates.length) ({ created, warnings } = await this.scheduling.addShifts(org, viewer, rosterId, plan.creates));
    } catch (e) {
      if (removed.length) await this.scheduling.restore(org, viewer, rosterId, removed.map((r) => r.id));
      await this.audit.record(org, { actor: viewer.email, command: plan.command, structured: summarize(plan), affectedIds: [], result: "failed", message: e instanceof Error ? e.message.slice(0, 300) : null });
      throw e;
    }
    await this.audit.record(org, { actor: viewer.email, command: plan.command, structured: summarize(plan), affectedIds: [...created, ...removed].map((s) => s.id), result: "done", message: null });
    const pick = (s: ShiftView) => ({ id: s.id, employeeId: s.employeeId, workDate: s.workDate });
    return { created: created.map(pick), removed: removed.map(pick), warnings };
  }

  async chat(org: OrganizationId, viewer: Viewer, screen: AssistantScreenContext, history: ChatTurn[], message: string): Promise<AssistantReply> {
    const text = message.trim();
    if (!text) throw new AssistantError("Escreva o que pretende.", "validation");
    if (text.length > MAX_MESSAGE) throw new AssistantError(`Mensagem demasiado longa (máx. ${MAX_MESSAGE} caracteres).`, "validation");
    const ctx = await this.context(org, screen);
    const session = new Session(this, org, viewer, ctx);
    if (!this.llm) return this.reply(session, "unavailable", UNAVAILABLE);
    const messages: LlmMessage[] = [
      { role: "system", content: systemPrompt(ctx, viewer.canWrite) },
      ...history.slice(-MAX_HISTORY).map((t): LlmMessage => (t.role === "user" ? { role: "user", content: t.text.slice(0, MAX_TURN_CHARS) } : { role: "assistant", content: t.text.slice(0, MAX_TURN_CHARS) })),
      { role: "user", content: text },
    ];
    const tools = TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters }));
    let final: string | null = null;
    for (let step = 0; step < MAX_STEPS; step++) {
      let res: Awaited<ReturnType<LlmPort["complete"]>>;
      try {
        res = await this.llm.complete({ messages, tools });
      } catch {
        // Falha do fornecedor nunca bloqueia as Escalas; o que já foi feito fica dito.
        return session.applied.created.length || session.applied.removed.length ? this.reply(session, "done", null) : this.reply(session, "unavailable", UNAVAILABLE);
      }
      if (!res.toolCalls.length) {
        final = res.text;
        break;
      }
      messages.push({ role: "assistant", content: res.text, toolCalls: res.toolCalls });
      for (const call of res.toolCalls) messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(await session.run(call)) });
      if (session.confirmation) break;
    }
    if (session.confirmation) return this.reply(session, "needs_confirmation", session.confirmation.summary);
    const status = session.applied.created.length || session.applied.removed.length ? "done" : session.publishFlow ? "publish_flow" : "answer";
    return this.reply(session, status, final?.trim() || (session.facts.length ? null : NO_DATA));
  }

  /** Confirmar uma alteração pedida antes; se a escala mudou entretanto, recalcula e volta a perguntar. */
  async confirm(org: OrganizationId, viewer: Viewer, token: string): Promise<AssistantReply> {
    const p = this.pending.get(token);
    if (!p || p.org !== org || p.userId !== viewer.userId || p.expiresAt <= this.now()) {
      this.pending.delete(token);
      throw new AssistantError("Este pedido expirou ou já foi tratado. Peça de novo ao assistente.", "expired");
    }
    if (!viewer.canWrite) throw new AssistantError("Sem permissão para alterar a escala.", "forbidden");
    this.pending.delete(token);
    const ctx = await this.context(org, p.screen);
    const session = new Session(this, org, viewer, ctx);
    const dates = p.plan.removes.map((r) => r.workDate).sort();
    let plan = p.plan;
    let changed = ctx.rosterVersion !== p.rosterVersion;
    if (dates.length) {
      const now = await session.shifts(dates[0]!, dates.at(-1)!);
      const still = p.plan.removes.map((r) => now.find((x) => x.id === r.id && x.pendingOnly)).filter((x): x is ShiftView => !!x);
      if (fingerprint(still) !== p.print) {
        changed = true;
        plan = { ...p.plan, removes: still };
      }
    }
    if (changed) {
      const names = await session.names();
      if (!plan.creates.length && !plan.removes.length) return this.reply(session, "answer", "A escala mudou entretanto e já não há nada a alterar.");
      const next = this.newToken();
      this.remember({ ...p, token: next, plan, print: fingerprint(plan.removes), rosterVersion: ctx.rosterVersion, expiresAt: this.now() + CONFIRM_TTL_MS });
      session.confirmation = { token: next, summary: `A escala mudou entretanto. ${confirmationSummary(plan, names)}` };
      return this.reply(session, "needs_confirmation", session.confirmation.summary);
    }
    try {
      await session.apply(plan, true);
    } catch (e) {
      if (e instanceof SchedulingBlockedError) return this.reply(session, "answer", `Não foi possível aplicar: ${e.violations[0]?.message ?? e.message}`);
      throw e;
    }
    return this.reply(session, "done", null);
  }

  async cancel(org: OrganizationId, viewer: Viewer, token: string): Promise<void> {
    const p = this.pending.get(token);
    if (p && p.org === org && p.userId === viewer.userId) {
      this.pending.delete(token);
      await this.audit.record(org, { actor: viewer.email, command: p.plan.command, structured: summarize(p.plan), affectedIds: [], result: "cancelled", message: null });
    }
  }

  async transcribe(audio: Buffer, mimeType: string): Promise<string> {
    if (!this.transcriber) throw new AssistantError(UNAVAILABLE, "unavailable");
    if (!audio.length) throw new AssistantError("Sem áudio.", "validation");
    try {
      return (await this.transcriber.transcribe(audio, mimeType)).trim();
    } catch {
      throw new AssistantError(UNAVAILABLE, "unavailable");
    }
  }

  private async reply(session: Session, status: AssistantReply["status"], text: string | null): Promise<AssistantReply> {
    const a = session.applied;
    const touched = [...a.created, ...a.removed].map((x) => x.workDate).sort();
    const applied = touched.length ? { label: session.labels.length === 1 ? session.labels[0]! : "ASSIGN_SHIFTS_BATCH", created: a.created, removed: a.removed, from: touched[0]!, to: touched.at(-1)! } : null;
    let pending = session.ctx.pending;
    if (applied) pending = (await session.shifts(session.ctx.from, session.ctx.to)).filter((s) => s.pendingOnly).length;
    const body = text ?? (session.facts.length ? `✓ ${session.facts.join("\n")}` : NO_DATA);
    return { status, text: body, facts: session.facts, applied, confirmation: session.confirmation, context: { rosterName: session.ctx.rosterName, from: session.ctx.from, to: session.ctx.to, pending } };
  }
}

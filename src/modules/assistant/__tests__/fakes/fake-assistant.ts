import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { EmployeeView, NewShift, ShiftView, TemplateView, Viewer } from "../../domain/entities/assistant.js";
import { SchedulingBlockedError, type AssistantAuditPort, type LlmMessage, type LlmPort, type LlmToolCall, type SchedulingPort, type Violation } from "../../domain/ports/out/assistant.ports.js";

/** IA falsa com guião: cada passo recebe as mensagens e devolve texto e/ou ferramentas. */
export class ScriptedLlm implements LlmPort {
  calls: LlmMessage[][] = [];
  constructor(private readonly steps: ((messages: LlmMessage[]) => { text?: string | null; tools?: [string, Record<string, unknown>][] })[]) {}
  async complete(input: { messages: LlmMessage[] }): Promise<{ text: string | null; toolCalls: LlmToolCall[] }> {
    this.calls.push(structuredClone(input.messages));
    const step = this.steps[this.calls.length - 1];
    if (!step) return { text: "Fim.", toolCalls: [] };
    const r = step(input.messages);
    return { text: r.text ?? null, toolCalls: (r.tools ?? []).map(([name, args], i) => ({ id: `c${this.calls.length}-${i}`, name, arguments: JSON.stringify(args) })) };
  }
  /** Resultado (JSON) da última ferramenta devolvida à IA. */
  static lastTool(messages: LlmMessage[]): Record<string, unknown> {
    const m = [...messages].reverse().find((x) => x.role === "tool") as { content: string } | undefined;
    return m ? (JSON.parse(m.content) as Record<string, unknown>) : {};
  }
}

export class FailingLlm implements LlmPort {
  async complete(): Promise<never> {
    throw new Error("provider down");
  }
}

const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
const overlap = (a: { start: string; end: string }[], b: { start: string; end: string }[]) => a.some((x) => b.some((y) => mins(x.start) < mins(y.end) && mins(y.start) < mins(x.end)));

/** Escalas em memória (regra de sobreposição simples; o motor real é testado no módulo rosters). */
export class FakeScheduling implements SchedulingPort {
  rosterVersion = 1;
  employees_: EmployeeView[] = [
    { id: "11111111-aaaa-4aaa-8aaa-000000000001", name: "João Silva", positionName: "Cozinha", member: true },
    { id: "11111111-aaaa-4aaa-8aaa-000000000002", name: "João Costa", positionName: "Sala", member: true },
    { id: "11111111-aaaa-4aaa-8aaa-000000000003", name: "Maria Santos", positionName: "Sala", member: true },
    { id: "11111111-aaaa-4aaa-8aaa-000000000004", name: "Ana Pereira", positionName: "Sala", member: true },
    { id: "11111111-aaaa-4aaa-8aaa-000000000005", name: "Outra Loja", positionName: "Sala", member: false },
  ];
  templates_: TemplateView[] = [{ id: "t-manha", name: "Manhã", abbreviation: "M", segments: [{ start: "09:00", end: "17:00" }] }];
  shifts_: ShiftView[] = [];
  absent = new Set<string>();
  gaps: { employeeId: string; date: string; segments: { start: string; end: string }[] }[] = [];
  addCalls = 0;
  removeCalls = 0;
  restoreCalls = 0;
  failNextAdd = false;
  private seq = 0;

  idOf(name: string) {
    return this.employees_.find((e) => e.name === name)!.id;
  }
  shift(name: string, workDate: string, start: string, end: string, published = false): ShiftView {
    const s: ShiftView = { id: `s-${++this.seq}`, employeeId: this.idOf(name), workDate, kind: "shift", segments: [{ start, end }], templateId: null, pendingOnly: !published, published };
    this.shifts_.push(s);
    return s;
  }

  async roster(_o: OrganizationId, id: string) {
    return id === "r1" ? { id: "r1", name: "Mercado Bom Sucesso", version: this.rosterVersion, targetType: "location", targetId: "l1" } : null;
  }
  async timeZone() {
    return "Europe/Lisbon";
  }
  async today() {
    return "2026-10-14";
  }
  async employees() {
    return this.employees_;
  }
  async shifts(_o: OrganizationId, _r: string, from: string, to: string) {
    return this.shifts_.filter((s) => s.workDate >= from && s.workDate <= to).map((s) => ({ ...s }));
  }
  async templates() {
    return this.templates_;
  }
  private conflictsFor(employeeId: string, workDate: string, segments: { start: string; end: string }[], ignore: Set<string> = new Set()): Violation[] {
    const v: Violation[] = [];
    if (this.shifts_.some((s) => !ignore.has(s.id) && s.employeeId === employeeId && s.workDate === workDate && overlap(s.segments, segments))) v.push({ rule: "overlap", severity: "block", employeeId, workDate, message: `Já há um turno planeado a essa hora em ${workDate} (turnos não se podem sobrepor).` });
    if (this.absent.has(`${employeeId}|${workDate}`)) v.push({ rule: "absence", severity: "warning", employeeId, workDate, message: `Turno num dia com ausência aprovada (${workDate}). Motivo: consulta médica` });
    return v;
  }
  async availability(_o: OrganizationId, _r: string, input: { workDate: string; segments: { start: string; end: string }[]; employeeIds: string[] }) {
    return input.employeeIds.map((employeeId) => {
      const reasons = this.conflictsFor(employeeId, input.workDate, input.segments);
      return { employeeId, status: reasons.some((r) => r.severity === "block") ? ("blocked" as const) : reasons.length ? ("warning" as const) : ("available" as const), reasons };
    });
  }
  async coverage() {
    return this.gaps;
  }
  async conflicts() {
    return { pending: this.shifts_.filter((s) => s.pendingOnly).length, violations: [] };
  }
  async addShifts(_o: OrganizationId, _a: unknown, _r: string, shifts: NewShift[]) {
    this.addCalls++;
    if (this.failNextAdd) {
      this.failNextAdd = false;
      throw new SchedulingBlockedError("bloqueado", [{ rule: "overlap", severity: "block", employeeId: shifts[0]!.employeeId, workDate: shifts[0]!.workDate, message: "Sobreposição" }]);
    }
    const blocked = shifts.flatMap((s) => this.conflictsFor(s.employeeId, s.workDate, s.segments).filter((v) => v.severity === "block"));
    if (blocked.length) throw new SchedulingBlockedError("Sobreposição", blocked);
    const created = shifts.map((s) => ({ id: `s-${++this.seq}`, employeeId: s.employeeId, workDate: s.workDate, kind: "shift" as const, segments: s.segments, templateId: s.templateId, pendingOnly: true, published: false }));
    this.shifts_.push(...created);
    return { created, warnings: [] };
  }
  removed: ShiftView[] = [];
  async removePending(_o: OrganizationId, _a: unknown, _r: string, shifts: ShiftView[]) {
    this.removeCalls++;
    const ids = new Set(shifts.map((s) => s.id));
    const out = this.shifts_.filter((s) => ids.has(s.id) && s.pendingOnly);
    this.removed.push(...out);
    this.shifts_ = this.shifts_.filter((s) => !out.includes(s));
    return out;
  }
  async restore(_o: OrganizationId, _a: unknown, _r: string, ids: string[]) {
    this.restoreCalls++;
    const back = this.removed.filter((s) => ids.includes(s.id));
    this.shifts_.push(...back);
    this.removed = this.removed.filter((s) => !ids.includes(s.id));
  }
  async createTemplate(_o: OrganizationId, _a: unknown, input: { name: string; abbreviation: string; segments: { start: string; end: string }[] }) {
    const t = { id: `t-${++this.seq}`, ...input };
    this.templates_.push(t);
    return t;
  }
}

export class FakeAudit implements AssistantAuditPort {
  entries: { command: string; result: string; affectedIds: string[] }[] = [];
  async record(_o: OrganizationId, e: { command: string; result: string; affectedIds: string[] }) {
    this.entries.push({ command: e.command, result: e.result, affectedIds: e.affectedIds });
  }
}

export function viewer(over: Partial<Viewer> = {}): Viewer {
  return { userId: "u-gestor", email: "gestor@demo.invalid", canRead: true, canWrite: true, canPrivate: false, canSee: async () => true, ...over };
}

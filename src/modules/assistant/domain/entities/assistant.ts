/**
 * Assistente Mezza (Escalas & Turnos). A IA interpreta; o backend valida e
 * executa com os serviços canónicos das Escalas. Nada aqui é fonte de
 * verdade — são DTOs da conversa e do que foi feito.
 */

/** O que o ecrã mostra (enviado pelo cliente; o servidor confirma tudo). */
export interface AssistantScreenContext {
  rosterId: string;
  /** Período visível (YYYY-MM-DD). */
  from: string;
  to: string;
}

/** Contexto resolvido no servidor (o cliente não o pode falsificar). */
export interface AssistantContext extends AssistantScreenContext {
  rosterName: string;
  rosterVersion: number;
  timeZone: string;
  today: string;
  /** Turnos por publicar no período visível. */
  pending: number;
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface Viewer {
  userId: string;
  email: string;
  /** Pode ler escalas (o router já o exige). */
  canRead: boolean;
  /** Pode alterar escalas (hr.schedules MANAGE). */
  canWrite: boolean;
  /** Pode ver o tipo de ausências privadas; senão só "Indisponível". */
  canPrivate: boolean;
  /** Âmbito (RE-34): colaboradores que esta pessoa pode ver. */
  canSee: (employeeId: string, date: string) => Promise<boolean>;
}

/** Turno como o assistente o vê (sem dados pessoais além do nome). */
export interface ShiftView {
  id: string;
  employeeId: string;
  workDate: string;
  kind: "shift" | "day_off";
  segments: { start: string; end: string }[];
  templateId: string | null;
  /** Nunca publicado: o assistente pode alterá-lo. */
  pendingOnly: boolean;
  /** Publicado (com ou sem alteração por publicar): só consulta. */
  published: boolean;
}

export interface EmployeeView {
  id: string;
  name: string;
  positionName: string | null;
  /** Do local da escala ou já com turnos nela (candidatos por omissão). */
  member: boolean;
}

export interface TemplateView {
  id: string;
  name: string;
  abbreviation: string;
  segments: { start: string; end: string }[];
}

/** Turno a criar (modelo ou horário). */
export interface NewShift {
  employeeId: string;
  workDate: string;
  templateId: string | null;
  segments: { start: string; end: string }[];
}

/** Uma alteração lógica: retirar pendentes e/ou criar novos (o mesmo modelo do Desfazer manual). */
export interface ChangePlan {
  command: string;
  label: string;
  creates: NewShift[];
  removes: ShiftView[];
  /** O que ficou por fazer e porquê (sem candidatos, publicado, etc.). */
  skipped: { what: string; reason: string }[];
}

export interface AppliedBatch {
  label: string;
  created: { id: string; employeeId: string; workDate: string }[];
  removed: { id: string; employeeId: string; workDate: string }[];
  from: string;
  to: string;
}

export type ReplyStatus = "answer" | "done" | "needs_confirmation" | "publish_flow" | "unavailable";

export interface AssistantReply {
  status: ReplyStatus;
  text: string;
  /** Linhas determinísticas do que o servidor fez (não dependem da IA). */
  facts: string[];
  applied: AppliedBatch | null;
  confirmation: { token: string; summary: string } | null;
  context: Pick<AssistantContext, "rosterName" | "from" | "to" | "pending">;
}

export class AssistantError extends Error {
  constructor(
    message: string,
    readonly code: "validation" | "not_found" | "forbidden" | "expired" | "unavailable",
  ) {
    super(message);
    this.name = "AssistantError";
  }
}

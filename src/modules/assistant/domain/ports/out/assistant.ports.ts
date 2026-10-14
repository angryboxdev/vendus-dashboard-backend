import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { EmployeeView, NewShift, ShiftView, TemplateView } from "../../entities/assistant.js";

/** Mensagens no formato neutro do modelo (independente do fornecedor). */
export type LlmMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: LlmToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface LlmToolCall {
  id: string;
  name: string;
  /** JSON (como vem do modelo; o servidor valida). */
  arguments: string;
}

export interface LlmPort {
  complete(input: { messages: LlmMessage[]; tools: { name: string; description: string; parameters: Record<string, unknown> }[] }): Promise<{ text: string | null; toolCalls: LlmToolCall[] }>;
}

/** Transcrição de voz (o áudio não é guardado). */
export interface TranscriberPort {
  transcribe(audio: Buffer, mimeType: string): Promise<string>;
}

export interface Violation {
  rule: string;
  severity: "warning" | "block";
  employeeId: string;
  workDate: string;
  message: string;
}

/** Erro das Escalas com bloqueios (ex.: sobreposição) — a IA recebe a mensagem. */
export class SchedulingBlockedError extends Error {
  constructor(
    message: string,
    readonly violations: Violation[],
  ) {
    super(message);
    this.name = "SchedulingBlockedError";
  }
}

/**
 * As Escalas vistas pelo assistente — implementadas no composition root com
 * os serviços canónicos (rosters, time-base, ausências, pessoas). Não há
 * segundo motor: conflitos, elegibilidade e cobertura vêm de lá.
 */
export interface SchedulingPort {
  roster(org: OrganizationId, rosterId: string): Promise<{ id: string; name: string; version: number; targetType: string; targetId: string } | null>;
  timeZone(org: OrganizationId): Promise<string>;
  today(org: OrganizationId): Promise<string>;
  employees(org: OrganizationId, rosterId: string): Promise<EmployeeView[]>;
  shifts(org: OrganizationId, rosterId: string, from: string, to: string): Promise<ShiftView[]>;
  templates(org: OrganizationId): Promise<TemplateView[]>;
  availability(org: OrganizationId, rosterId: string, input: { workDate: string; segments: { start: string; end: string }[]; employeeIds: string[] }): Promise<{ employeeId: string; status: "available" | "warning" | "blocked"; reasons: Violation[] }[]>;
  /** Pessoas que deviam trabalhar e não têm turno (com as horas do horário, se houver). */
  coverage(org: OrganizationId, rosterId: string, employees: EmployeeView[], from: string, to: string): Promise<{ employeeId: string; date: string; segments: { start: string; end: string }[] }[]>;
  conflicts(org: OrganizationId, rosterId: string): Promise<{ pending: number; violations: Violation[] }>;
  addShifts(org: OrganizationId, actor: { userId: string; email: string }, rosterId: string, shifts: NewShift[]): Promise<{ created: ShiftView[]; warnings: Violation[] }>;
  removePending(org: OrganizationId, actor: { userId: string; email: string }, rosterId: string, shifts: ShiftView[]): Promise<ShiftView[]>;
  restore(org: OrganizationId, actor: { userId: string; email: string }, rosterId: string, ids: string[]): Promise<void>;
  createTemplate(org: OrganizationId, actor: { userId: string; email: string }, input: { name: string; abbreviation: string; segments: { start: string; end: string }[] }): Promise<TemplateView>;
}

export interface AssistantAuditPort {
  record(
    org: OrganizationId,
    entry: { actor: string; command: string; structured: unknown; affectedIds: string[]; result: "done" | "failed" | "confirmation_requested" | "cancelled"; message: string | null },
  ): Promise<void>;
}

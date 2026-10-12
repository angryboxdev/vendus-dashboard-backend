/**
 * Espaço de trabalho do Novo RH (Fase 9 — ADR-0033): tarefas operacionais
 * com checklist e prazo, solicitações personalizadas (C6.3) e "Quem está"
 * com visibilidade mínima (C6.7, CF-15).
 */
export class WorkspaceError extends Error {
  constructor(
    message: string,
    readonly code: "validation" | "not_found" | "invalid_state" | "forbidden",
    readonly field: string | null = null,
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}

// ── Tarefas ───────────────────────────────────────────────────────────
export interface ChecklistItem {
  id: string;
  text: string;
  required: boolean;
  done: boolean;
  doneBy: string | null;
  doneAt: string | null;
}

export interface OpsTask {
  id: string;
  title: string;
  description: string | null;
  assigneeEmployeeId: string | null;
  locationId: string | null;
  dueAt: string | null;
  checklist: ChecklistItem[];
  status: "open" | "done" | "cancelled";
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
}

export type TaskInput = Pick<OpsTask, "title" | "description" | "assigneeEmployeeId" | "locationId" | "dueAt"> & { checklist: { text: string; required: boolean }[] };

export function validateTask(t: TaskInput): void {
  if (!t.title?.trim() || t.title.trim().length > 160) throw new WorkspaceError("O título é obrigatório (máx. 160).", "validation", "title");
  if (t.dueAt !== null && Number.isNaN(Date.parse(t.dueAt))) throw new WorkspaceError("Prazo inválido.", "validation", "dueAt");
  if (!Array.isArray(t.checklist) || t.checklist.length > 50) throw new WorkspaceError("No máximo 50 itens.", "validation", "checklist");
  if (t.checklist.some((i) => !i.text?.trim() || i.text.trim().length > 200)) throw new WorkspaceError("Cada item precisa de texto (máx. 200).", "validation", "checklist");
}

/** Só se conclui com os itens obrigatórios feitos. */
export const missingRequired = (t: OpsTask) => t.checklist.filter((i) => i.required && !i.done);

// ── Solicitações personalizadas ───────────────────────────────────────
export interface FormField {
  id: string;
  title: string;
  type: "single" | "multiple" | "text";
  options: string[];
  required: boolean;
}

export interface RequestForm {
  id: string;
  title: string;
  responseDays: number | null;
  fields: FormField[];
  archived: boolean;
}

export type RequestFormInput = Omit<RequestForm, "id" | "archived">;

export interface CustomRequest {
  id: string;
  formId: string;
  employeeId: string;
  requestedByUserId: string;
  answers: Record<string, string | string[]>;
  status: "pending" | "approved" | "rejected";
  dueAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
  createdAt: string;
}

/** C6.3: título obrigatório; até 50 campos; escolhas com opções. */
export function validateForm(f: RequestFormInput): void {
  if (!f.title?.trim()) throw new WorkspaceError("O título é obrigatório", "validation", "title");
  if (f.title.trim().length > 120) throw new WorkspaceError("Máximo de 120 caracteres.", "validation", "title");
  if (f.responseDays !== null && (!Number.isInteger(f.responseDays) || f.responseDays < 1 || f.responseDays > 365)) throw new WorkspaceError("Prazo de resposta entre 1 e 365 dias.", "validation", "responseDays");
  if (!Array.isArray(f.fields) || f.fields.length < 1 || f.fields.length > 50) throw new WorkspaceError("Um formulário tem de 1 a 50 campos.", "validation", "fields");
  const ids = new Set<string>();
  for (const field of f.fields) {
    if (!field.id || ids.has(field.id)) throw new WorkspaceError("Campos com identificador repetido.", "validation", "fields");
    ids.add(field.id);
    if (!field.title?.trim()) throw new WorkspaceError("Cada campo precisa de título.", "validation", "fields");
    if (!["single", "multiple", "text"].includes(field.type)) throw new WorkspaceError("Tipo de campo inválido.", "validation", "fields");
    if (field.type !== "text" && (!Array.isArray(field.options) || field.options.length < 1)) throw new WorkspaceError(`"${field.title}" precisa de opções.`, "validation", "fields");
  }
}

export function validateAnswers(form: RequestForm, answers: Record<string, unknown>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const f of form.fields) {
    const v = answers[f.id];
    const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (f.required) throw new WorkspaceError(`Responda a "${f.title}".`, "validation", f.id);
      continue;
    }
    if (f.type === "text") {
      if (typeof v !== "string" || v.length > 2000) throw new WorkspaceError(`Resposta inválida em "${f.title}".`, "validation", f.id);
      out[f.id] = v.trim();
    } else if (f.type === "single") {
      if (typeof v !== "string" || !f.options.includes(v)) throw new WorkspaceError(`Escolha uma opção em "${f.title}".`, "validation", f.id);
      out[f.id] = v;
    } else {
      if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !f.options.includes(x))) throw new WorkspaceError(`Escolhas inválidas em "${f.title}".`, "validation", f.id);
      out[f.id] = [...new Set(v as string[])];
    }
  }
  return out;
}

// ── Quem está ─────────────────────────────────────────────────────────
export interface Presence {
  employeeId: string;
  name: string;
  state: "work" | "remote" | "break_paid" | "break_unpaid";
  since: string;
  locationIds: string[];
}

/** CF-15: com "só o próprio centro", ninguém de outros centros aparece (na API). */
export function visiblePresence(rows: Presence[], viewerLocations: string[], scope: "own_location" | "organization"): Presence[] {
  if (scope === "organization") return rows;
  return rows.filter((r) => r.locationIds.some((l) => viewerLocations.includes(l)));
}

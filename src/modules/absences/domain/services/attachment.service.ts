import { AbsenceValidationError } from "../errors.js";

/**
 * Anexo de um pedido de ausência carregado pelo colaborador (Portal ligado ao
 * Novo RH — justificar falta). Regras puras: o que se aceita e de quem é.
 */
export interface AbsenceAttachment {
  path: string;
  name: string;
  mime: string;
}

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"] as const;

export function validateAttachmentFile(f: { name: string; mime: string; size: number }): void {
  if (!f.size) throw new AbsenceValidationError("Escolha um ficheiro.", "file");
  if (f.size > ATTACHMENT_MAX_BYTES) throw new AbsenceValidationError("O ficheiro tem de ter até 10 MB.", "file");
  if (!(ATTACHMENT_MIMES as readonly string[]).includes(f.mime)) throw new AbsenceValidationError("Só PDF ou imagem (JPG, PNG, WEBP, HEIC).", "file");
}

/** Nome seguro para o caminho (sem pastas nem caracteres estranhos), mantendo a extensão. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "anexo";
  const clean = base.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return (clean || "anexo").slice(-80);
}

/** Pasta do colaborador (relativa; o armazenamento acrescenta `{org}/` à frente). */
export const attachmentFolder = (employeeId: string) => `absence-attachments/${employeeId}/`;

/**
 * Só se aceita um anexo carregado para a pasta do próprio colaborador nesta
 * organização — nunca um caminho arbitrário (outra pessoa, outra empresa, `..`).
 */
export function ownsAttachment(path: string, org: string, employeeId: string): boolean {
  return !path.includes("..") && path.startsWith(`${org}/${attachmentFolder(employeeId)}`) && path.length > `${org}/${attachmentFolder(employeeId)}`.length;
}

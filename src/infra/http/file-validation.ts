/**
 * Validação partilhada de ficheiros enviados (task RH §4.2: "ficheiros com
 * tipo e tamanho validados"). Confirma o tipo pelo conteúdo (assinatura dos
 * primeiros bytes), não só pelo `mimetype` que o browser declara — um .exe
 * renomeado para .pdf é recusado.
 */

export type AllowedFileKind = "pdf" | "jpeg" | "png" | "webp";

export const MIME_OF: Record<AllowedFileKind, string> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export interface FilePolicy {
  allowed: AllowedFileKind[];
  maxBytes: number;
}

/** Documentos de RH (comprovativos, certificados, fotos de documentos). */
export const HR_DOCUMENT_POLICY: FilePolicy = { allowed: ["pdf", "jpeg", "png", "webp"], maxBytes: 10 * 1024 * 1024 };

export type FileCheck = { ok: true; kind: AllowedFileKind; mime: string } | { ok: false; reason: "empty" | "too_large" | "type_not_allowed" | "content_mismatch"; message: string };

const startsWith = (buf: Uint8Array, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b);

/** Tipo real pelo conteúdo; null se não for nenhum dos conhecidos. */
export function sniffKind(buf: Uint8Array): AllowedFileKind | null {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return "webp"; // RIFF....WEBP
  return null;
}

export function validateFile(file: { buffer: Uint8Array; size: number; mimetype: string }, policy: FilePolicy): FileCheck {
  if (!file.size || file.buffer.length === 0) return { ok: false, reason: "empty", message: "O ficheiro está vazio." };
  if (file.size > policy.maxBytes) {
    return { ok: false, reason: "too_large", message: `O ficheiro tem mais de ${Math.round(policy.maxBytes / 1024 / 1024)} MB.` };
  }
  const kind = sniffKind(file.buffer);
  if (!kind || !policy.allowed.includes(kind)) {
    return { ok: false, reason: "type_not_allowed", message: `Tipo de ficheiro não aceite (${policy.allowed.map((k) => k.toUpperCase()).join(", ")}).` };
  }
  if (file.mimetype && file.mimetype !== MIME_OF[kind] && !(kind === "jpeg" && file.mimetype === "image/jpg")) {
    return { ok: false, reason: "content_mismatch", message: "O conteúdo do ficheiro não corresponde ao tipo indicado." };
  }
  return { ok: true, kind, mime: MIME_OF[kind] };
}

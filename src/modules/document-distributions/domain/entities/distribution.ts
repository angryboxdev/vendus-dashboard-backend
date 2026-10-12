/**
 * Envio de documentos (FE-065): o mesmo ficheiro enviado a vários
 * colaboradores, guardado uma só vez. Os destinatários ficam congelados no
 * envio; cada um tem a sua linha (entregue / lido / confirmado).
 */
export type Audience = { type: "all" } | { type: "locations" | "departments" | "employees"; ids: string[] };

export interface Distribution {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  audience: Audience;
  requiresConfirmation: boolean;
  status: "sent" | "archived";
  createdBy: string;
  createdAt: string;
}

export interface DistributionRecipient {
  distributionId: string;
  employeeId: string;
  userId: string | null;
  deliveredAt: string;
  readAt: string | null;
  confirmedAt: string | null;
}

export class DistributionError extends Error {
  constructor(
    message: string,
    readonly code: "validation" | "not_found" | "invalid_state" | "confirmation_not_required",
    readonly field: string | null = null,
  ) {
    super(message);
    this.name = "DistributionError";
  }
}

/** Mesmos tipos e limite dos documentos de colaborador. */
export const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];
export const MAX_BYTES = 20 * 1024 * 1024;

export function validateAudience(a: Audience | undefined): asserts a is Audience {
  if (!a || !["all", "locations", "departments", "employees"].includes(a.type)) throw new DistributionError("Escolha os destinatários.", "validation", "audience");
  if (a.type !== "all" && (!Array.isArray(a.ids) || a.ids.length === 0)) throw new DistributionError("Escolha pelo menos um destinatário.", "validation", "audience");
}

export function validateNew(input: { title: string; audience: Audience | undefined; file: { name: string; mimeType: string; size: number } | null }): void {
  if (!input.title?.trim() || input.title.trim().length > 160) throw new DistributionError("O título é obrigatório (máx. 160).", "validation", "title");
  validateAudience(input.audience);
  const f = input.file;
  if (!f || !f.size) throw new DistributionError("Escolha o ficheiro.", "validation", "file");
  if (!ALLOWED_MIME.includes(f.mimeType)) throw new DistributionError("Só PDF, JPEG ou PNG.", "validation", "file");
  if (f.size > MAX_BYTES) throw new DistributionError("O ficheiro tem mais de 20 MB.", "validation", "file");
}

export type RecipientStatus = "delivered" | "read" | "confirmed";
export const recipientStatus = (r: Pick<DistributionRecipient, "readAt" | "confirmedAt">): RecipientStatus => (r.confirmedAt ? "confirmed" : r.readAt ? "read" : "delivered");

/** Ainda falta algo a este destinatário: confirmar (se pedido) ou abrir. */
export const isPending = (d: Pick<Distribution, "requiresConfirmation">, r: Pick<DistributionRecipient, "readAt" | "confirmedAt">) => (d.requiresConfirmation ? !r.confirmedAt : !r.readAt);

/** Prova de entrega/leitura em CSV (`;`, BOM). Células começadas por = + - @ ficam neutralizadas. */
export function proofCsv(rows: { name: string; deliveredAt: string; readAt: string | null; confirmedAt: string | null }[]): string {
  const cell = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = ["Colaborador;Entregue;Aberto;Confirmado"];
  for (const r of rows) lines.push([cell(r.name), cell(r.deliveredAt), cell(r.readAt ?? ""), cell(r.confirmedAt ?? "")].join(";"));
  return "﻿" + lines.join("\r\n");
}

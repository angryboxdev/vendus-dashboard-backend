/**
 * Comunicados (Eng. Reversa 07/08; RE-31, RE-32 — ADR-0033): rascunho
 * editável; ao publicar, os destinatários ficam congelados; texto alterado
 * depois de publicado = versão nova; recibos por versão.
 */
export type Audience = { type: "all" } | { type: "locations" | "groups" | "employees"; ids: string[] };

export interface Announcement {
  id: string;
  status: "draft" | "published" | "archived";
  audience: Audience;
  requiresConfirmation: boolean;
  currentVersion: number;
  title: string;
  body: string;
  publishedAt: string | null;
  publishedBy: string | null;
  createdAt: string;
}

export interface Receipt {
  announcementId: string;
  version: number;
  employeeId: string;
  deliveredAt: string;
  readAt: string | null;
  confirmedAt: string | null;
}

export class AnnouncementError extends Error {
  constructor(
    message: string,
    readonly code: "validation" | "audience_frozen" | "invalid_state" | "not_found" | "confirmation_not_required",
    readonly field: string | null = null,
  ) {
    super(message);
    this.name = "AnnouncementError";
  }
}

export function validateDraft(input: { title: string; body: string; audience: Audience }): void {
  if (!input.title?.trim() || input.title.trim().length > 160) throw new AnnouncementError("O título é obrigatório (máx. 160).", "validation", "title");
  if (typeof input.body !== "string" || input.body.length > 20000) throw new AnnouncementError("Texto demasiado longo.", "validation", "body");
  const a = input.audience;
  if (!a || !["all", "locations", "groups", "employees"].includes(a.type)) throw new AnnouncementError("Escolha os destinatários.", "validation", "audience");
  if (a.type !== "all" && (!Array.isArray(a.ids) || a.ids.length === 0)) throw new AnnouncementError("Escolha pelo menos um destinatário.", "validation", "audience");
}

export type ReceiptStatus = "delivered" | "read" | "confirmed";
export const receiptStatus = (r: Receipt): ReceiptStatus => (r.confirmedAt ? "confirmed" : r.readAt ? "read" : "delivered");

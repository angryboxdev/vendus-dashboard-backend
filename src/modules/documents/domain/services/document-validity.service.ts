import type { Document } from "../entities/document.js";

export type DocumentDisplayStatus =
  | "ok"
  | "expiring"
  | "expired"
  | "pending_validation"
  | "rejected"
  | "removed";

/**
 * Threshold de "a expirar" — constante nomeada, não persistida por
 * organização nesta fase (simplificação documentada no README do módulo).
 */
export const EXPIRING_SOON_DAYS = 30;

/**
 * Estado de exibição de uma versão de documento — o mesmo para documentos
 * da Empresa e de Colaborador ("Válido" / "A expirar" / "Expirado" / "A
 * validar" / …).
 */
export function computeDocumentDisplayStatus(
  doc: Pick<Document, "status" | "expiresAt" | "isCurrent">,
  now: Date = new Date(),
): DocumentDisplayStatus {
  if (!doc.isCurrent || doc.status === "removed") return "removed";
  if (doc.status === "rejected") return "rejected";
  if (doc.status === "pending_validation") return "pending_validation";
  if (doc.expiresAt) {
    const expiresAtMs = new Date(doc.expiresAt).getTime();
    const daysRemaining = Math.ceil((expiresAtMs - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysRemaining < 0) return "expired";
    if (daysRemaining <= EXPIRING_SOON_DAYS) return "expiring";
  }
  return "ok";
}

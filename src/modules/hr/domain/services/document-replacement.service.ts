/**
 * Portal (ticket 11): o colaborador só pode substituir documentos seus
 * **vencidos ou a vencer nos próximos 30 dias**, e nunca enquanto um envio
 * anterior aguarda validação. Regra pura, partilhada pela listagem (botão
 * "Substituir") e pelo envio.
 */
export const REPLACE_WINDOW_DAYS = 30;

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export type ReplaceCheck = { ok: true } | { ok: false; reason: string };

export function canReplaceDocument(doc: { status: string; expiresAt: string | null }, today: string): ReplaceCheck {
  if (doc.status === "pending_validation") return { ok: false, reason: "Já enviou uma substituição — aguarda validação do RH." };
  if (!doc.expiresAt || doc.expiresAt > addDays(today, REPLACE_WINDOW_DAYS)) {
    return { ok: false, reason: `Só é possível substituir documentos vencidos ou a vencer nos próximos ${REPLACE_WINDOW_DAYS} dias.` };
  }
  return { ok: true };
}

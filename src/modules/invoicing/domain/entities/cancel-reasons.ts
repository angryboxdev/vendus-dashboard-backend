import { InvoicingRuleError } from "../errors.js";

/**
 * Anular só corrige erros que não mexem em valores nem no IVA, ou documentos
 * ainda não entregues; o resto faz-se com nota de crédito/débito (PIV 26393 e
 * 22435; FAQ AT 4326 — pesquisa-perguntas-abertas.md §2).
 */
export const CANCEL_REASONS = [
  { code: "not-delivered", label: "Documento não entregue ao cliente" },
  { code: "wrong-customer-tax-id", label: "NIF do adquirente errado" },
  { code: "wrong-description", label: "Erro de descritivo" },
] as const;

export type CancelReasonCode = (typeof CANCEL_REASONS)[number]["code"];

export function cancelReasonText(code: CancelReasonCode, note?: string): string {
  const reason = CANCEL_REASONS.find((r) => r.code === code);
  if (!reason) throw new InvoicingRuleError(`Motivo de anulação inválido: ${String(code)}`);
  const extra = note?.trim();
  return extra ? `${reason.label} - ${extra}` : reason.label;
}

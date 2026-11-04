import { InvoicingRuleError } from "../errors.js";

/**
 * SourceID gravado nos documentos (SAF-T: máx. 30 caracteres; não se reutiliza
 * para outro utilizador — Despacho 8632/2014, 3.3.6). Deriva do id estável do
 * utilizador (UUID sem hífens, 30 caracteres), nunca do email, que muda e é longo.
 */
export function sourceIdFor(userId: string): string {
  const compact = userId.trim().replace(/-/g, "");
  if (!compact) throw new InvoicingRuleError("Utilizador sem identificação");
  return compact.slice(0, 30);
}

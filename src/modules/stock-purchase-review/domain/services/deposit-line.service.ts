/**
 * Depósito de embalagem (sistema de depósito português de latas e garrafas): o valor cobrado por
 * cada embalagem é devolvido quando a embalagem é entregue — não é um artigo, nunca entra no Stock.
 * Ex.: «DEPOSITO 28 X 0.10 EUR», «Depósito embalagem», «Dep. garrafa».
 */
export function isDepositLine(description: string): boolean {
  const t = description.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  return /^(deposito|dep\.)(\s|$)/.test(t) || /\bdeposito\s+(de\s+)?(embalagem|embalagens|garrafa|garrafas|lata|latas|vasilhame)\b/.test(t);
}

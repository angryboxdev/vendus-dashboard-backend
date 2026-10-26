export interface DedupMovement {
  bookingDate: Date;
  amount: number;
  movementType: "debit" | "credit";
  balanceAfter: number;
  description: string;
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const normDesc = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();
const balanceKey = (m: DedupMovement) => `${day(m.bookingDate)}|${m.amount}|${m.movementType}|${m.balanceAfter}`;
const descKey = (m: DedupMovement) => `${day(m.bookingDate)}|${m.amount}|${m.movementType}|${normDesc(m.description)}`;

/**
 * Que movimentos de um extrato são novos face aos já gravados da mesma conta (task V2 §10).
 *
 * Correspondência um-para-um (cada gravado só «absorve» um movimento do ficheiro):
 * 1.º pela data + valor + tipo + **saldo após o movimento** (quando o ficheiro traz saldos reais) —
 *    distingue dois movimentos iguais no mesmo dia (dois créditos TPA do mesmo valor) e reconhece o
 *    mesmo movimento vindo de formatos diferentes (XLSX vs PDF descrevem-no de forma diferente);
 * 2.º pela data + valor + tipo + descrição normalizada (ficheiros sem saldos e movimentos antigos).
 * Antes, o hash `conta|data|descrição|valor|tipo` tratava o 2.º movimento igual como duplicado e
 * perdia-o.
 */
export function selectNewMovements<T extends DedupMovement>(incoming: T[], existing: DedupMovement[], balancesReliable: boolean): { fresh: T[]; duplicates: number } {
  const consumed = new Set<number>();
  const index = (key: (m: DedupMovement) => string) => {
    const map = new Map<string, number[]>();
    existing.forEach((m, i) => map.set(key(m), [...(map.get(key(m)) ?? []), i]));
    return map;
  };
  const byBalance = index(balanceKey);
  const byDesc = index(descKey);
  const take = (map: Map<string, number[]>, key: string) => {
    const i = (map.get(key) ?? []).find((j) => !consumed.has(j));
    if (i === undefined) return false;
    consumed.add(i);
    return true;
  };

  const matched = new Set<number>();
  // Duas passagens: primeiro todas as correspondências exatas pelo saldo, só depois pela descrição —
  // assim um movimento sem par pelo saldo nunca «rouba» o par de outro.
  if (balancesReliable) incoming.forEach((m, i) => take(byBalance, balanceKey(m)) && matched.add(i));
  incoming.forEach((m, i) => !matched.has(i) && take(byDesc, descKey(m)) && matched.add(i));

  return { fresh: incoming.filter((_, i) => !matched.has(i)), duplicates: matched.size };
}

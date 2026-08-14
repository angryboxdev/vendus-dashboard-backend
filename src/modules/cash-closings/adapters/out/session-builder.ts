import type { RegisterSession } from "../../domain/entities/register-session.js";
import type { VendusRegisterMovement } from "../../../vendus/domain/ports/out/vendus-gateway.port.js";

export type { VendusRegisterMovement };

export interface DocEntry {
  type: string;
  amount: number;
}

/**
 * Resolve o doc_id de um NC a partir do document_id de um movimento "out".
 *
 * O Vendus devolve o doc_id da NC deslocado em +1 ou +2 nos movimentos "out".
 * Tenta doc_id, doc_id-1 e doc_id-2 até encontrar uma NC no docMap.
 */
function resolveNcId(documentId: number, docMap: Map<number, DocEntry>): number | null {
  for (const candidateId of [documentId, documentId - 1, documentId - 2]) {
    const doc = docMap.get(candidateId);
    if (doc?.type === "NC") return candidateId;
  }
  return null;
}

/**
 * Constrói sessões a partir de movimentos ordenados ASC por hora.
 *
 * Total por sessão = sum("in" movements) − NC deductions.
 *
 * NCs são identificadas via docMap e associadas a sessões de duas formas:
 *   1. "out" movements dentro de uma sessão activa com document_id > 0 → NC
 *      descontada da sessão corrente. O Vendus devolve doc_id+1 ou doc_id+2
 *      nos movimentos "out" de NC — tentamos até doc_id-2.
 *   2. NCs do dia sem movimento dentro de nenhuma sessão activa → atribuídas
 *      à sessão única (dia normal) ou à última sessão (heurística multi-turno).
 *      EXCEPÇÃO: se a NC tem um "out" movement no dia mas este ocorreu antes
 *      do primeiro "open" (sessão cross-day que abriu no dia anterior), a NC
 *      NÃO é atribuída como fallback — pertence à sessão anterior, não a esta.
 *
 * Replica a lógica do dashboard: sumGrossCents = sum(FS/FT) - sum(NC).
 */
export function buildSessions(
  movements: VendusRegisterMovement[],
  docMap: Map<number, DocEntry>,
): RegisterSession[] {
  const sorted = [...movements].sort((a, b) => a.time.localeCompare(b.time));

  // Pré-passo: regista todas as NCs que têm um "out" movement em qualquer
  // ponto do dia (incluindo antes do primeiro "open"). Estas NCs pertencem
  // a uma sessão cross-day e não devem ser aplicadas como fallback.
  const referencedByMovement = new Set<number>();
  for (const m of sorted) {
    if (m.operation === "out" && m.document_id > 0) {
      const ncId = resolveNcId(m.document_id, docMap);
      if (ncId !== null) referencedByMovement.add(ncId);
    }
  }

  interface SessionAcc {
    openedAt: string;
    closedAt: string | null;
    salesTotal: number;
    ncDeductions: number;
    handledNcIds: Set<number>;
  }

  const sessions: SessionAcc[] = [];
  let cur: SessionAcc | null = null;

  for (const m of sorted) {
    if (m.operation === "open") {
      cur = { openedAt: `${m.date}T${m.time}`, closedAt: null, salesTotal: 0, ncDeductions: 0, handledNcIds: new Set() };
    } else if (m.operation === "close" && cur !== null) {
      cur.closedAt = `${m.date}T${m.time}`;
      sessions.push(cur);
      cur = null;
    } else if (m.operation === "in" && cur !== null) {
      cur.salesTotal += parseFloat(m.amount) || 0;
    } else if (m.operation === "out" && cur !== null && m.document_id > 0) {
      const ncId = resolveNcId(m.document_id, docMap);
      if (ncId !== null) {
        const doc = docMap.get(ncId)!;
        cur.ncDeductions += doc.amount;
        cur.handledNcIds.add(ncId);
      }
    }
  }

  // Sessão ainda aberta
  if (cur !== null) sessions.push(cur);

  // NCs do dia sem movimento dentro de qualquer sessão activa.
  // Excluem-se NCs que têm um "out" movement no dia (cross-day): já foram
  // tratadas pela sessão anterior e não devem ser debitadas desta.
  const handledIds = new Set(sessions.flatMap((s) => [...s.handledNcIds]));
  const unhandledNcs = [...docMap.entries()].filter(
    ([id, doc]) => doc.type === "NC" && !handledIds.has(id) && !referencedByMovement.has(id),
  );
  if (unhandledNcs.length > 0 && sessions.length > 0) {
    // Sessão única → atribui tudo; múltiplas → atribui à última (heurística)
    const target = sessions[sessions.length - 1]!;
    for (const [, doc] of unhandledNcs) {
      target.ncDeductions += doc.amount;
    }
  }

  return sessions.map((s) => ({
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    total: Math.round((s.salesTotal - s.ncDeductions) * 100) / 100,
  }));
}

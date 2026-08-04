import type { RegisterSession } from "../../domain/entities/register-session.js";
import type { VendusRegisterMovement } from "../../../vendus/domain/ports/out/vendus-gateway.port.js";

export type { VendusRegisterMovement };

export interface DocEntry {
  type: string;
  amount: number;
}

/**
 * Constrói sessões a partir de movimentos ordenados ASC por hora.
 *
 * Total por sessão = sum("in" movements) − NC deductions.
 *
 * NCs não têm `type` nos movements (todos têm type "NU"); são identificadas
 * via docMap:
 *   1. "out" movements com document_id > 0 → se NC, desconta da sessão corrente.
 *      ATENÇÃO: o Vendus devolve doc_id+1 nos movimentos "out" de NC — tentamos
 *      também doc_id-1 quando o lookup directo falha.
 *   2. NCs do dia não encontradas em nenhum movimento → atribuídas à sessão
 *      única (dia normal) ou à última sessão (heurística multi-turno).
 *
 * Replica a lógica do dashboard: sumGrossCents = sum(FS/FT) - sum(NC).
 */
export function buildSessions(
  movements: VendusRegisterMovement[],
  docMap: Map<number, DocEntry>,
): RegisterSession[] {
  const sorted = [...movements].sort((a, b) => a.time.localeCompare(b.time));

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
      // Vendus devolve doc_id+1 nos movimentos "out" de NC — tenta também doc_id-1
      const resolvedId = docMap.has(m.document_id) ? m.document_id : m.document_id - 1;
      const doc = docMap.get(resolvedId);
      if (doc?.type === "NC") {
        cur.ncDeductions += doc.amount;
        cur.handledNcIds.add(resolvedId);
      }
    }
  }

  // Sessão ainda aberta
  if (cur !== null) sessions.push(cur);

  // NCs do dia que não apareceram em nenhum movimento "out"
  const handledIds = new Set(sessions.flatMap((s) => [...s.handledNcIds]));
  const unhandledNcs = [...docMap.entries()].filter(
    ([id, doc]) => doc.type === "NC" && !handledIds.has(id),
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

import type { VendusRegisterSessionsGatewayPort } from "../../domain/ports/out/vendus-register-sessions-gateway.port.js";
import { vendusGetBasic } from "../../../../infra/vendusClient.js";
import { fetchAllDocuments } from "../../../../services/documentsService.js";
import { buildSessions, type VendusMovement, type DocEntry } from "./session-builder.js";

/**
 * Constrói mapa de document_id → { type, amount } para FS, FT e NC do dia.
 * Necessário para replicar a lógica do dashboard: sum(FS/FT) - sum(NC).
 */
async function buildDocMap(date: string): Promise<Map<number, DocEntry>> {
  const map = new Map<number, DocEntry>();
  try {
    const { documents } = await fetchAllDocuments(date, date, "FS,FT,NC", 500);
    for (const doc of documents) {
      const d = doc as { id?: string | number; type?: string; amount_gross?: string };
      if (d.id != null && d.type && d.amount_gross != null) {
        map.set(Number(d.id), {
          type: d.type,
          amount: parseFloat(d.amount_gross) || 0,
        });
      }
    }
  } catch {
    // best-effort: se falhar, retorna mapa vazio (sem desconto de NC)
  }
  return map;
}


export class VendusRegisterSessionsGateway implements VendusRegisterSessionsGatewayPort {
  private readonly registerId: string;

  constructor(registerId: string) {
    this.registerId = registerId;
  }

  async getSessionsForDate(date: string): Promise<RegisterSession[]> {
    const [movements, docMap] = await Promise.all([
      this.fetchMovements(date),
      buildDocMap(date),
    ]);
    return buildSessions(movements, docMap);
  }

  async getSessionTotal(date: string, sessionOpenedAt: string): Promise<number> {
    const [movements, docMap] = await Promise.all([
      this.fetchMovements(date),
      buildDocMap(date),
    ]);
    const sessions = buildSessions(movements, docMap);
    return sessions.find((s) => s.openedAt === sessionOpenedAt)?.total ?? 0;
  }

  private async fetchMovements(date: string): Promise<VendusMovement[]> {
    type MovementsResponse = VendusMovement[] | { errors?: unknown };

    const response = await vendusGetBasic<MovementsResponse>(
      `/v1.1/registers/${this.registerId}/movements/`,
      { since: date, until: date, per_page: 500 },
    );

    if (Array.isArray(response)) return response;
    return [];
  }
}

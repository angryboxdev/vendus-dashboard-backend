import type { VendusRegisterSessionsGatewayPort } from "../../domain/ports/out/vendus-register-sessions-gateway.port.js";
import type { RegisterSession } from "../../domain/entities/register-session.js";
import type { VendusGatewayPort } from "../../../vendus/domain/ports/out/vendus-gateway.port.js";
import { buildSessions, type DocEntry } from "./session-builder.js";

async function buildDocMap(
  gateway: VendusGatewayPort,
  date: string,
): Promise<Map<number, DocEntry>> {
  const map = new Map<number, DocEntry>();
  try {
    const docs = await gateway.listDocuments({ since: date, until: date, type: "FS,FT,NC", per_page: 500 });
    for (const doc of docs) {
      map.set(doc.id, { type: doc.type, amount: parseFloat(doc.amount_gross) || 0 });
    }
  } catch {
    // best-effort: se falhar, retorna mapa vazio (sem desconto de NC)
  }
  return map;
}

export class VendusRegisterSessionsGateway implements VendusRegisterSessionsGatewayPort {
  private readonly registerId: string;
  private readonly vendusGateway: VendusGatewayPort;

  constructor(registerId: string, vendusGateway: VendusGatewayPort) {
    this.registerId = registerId;
    this.vendusGateway = vendusGateway;
  }

  async getSessionsForDate(date: string): Promise<RegisterSession[]> {
    const [movements, docMap] = await Promise.all([
      this.vendusGateway.listRegisterMovements(this.registerId, date),
      buildDocMap(this.vendusGateway, date),
    ]);
    return buildSessions(movements, docMap);
  }

  async getSessionTotal(date: string, sessionOpenedAt: string): Promise<number> {
    const [movements, docMap] = await Promise.all([
      this.vendusGateway.listRegisterMovements(this.registerId, date),
      buildDocMap(this.vendusGateway, date),
    ]);
    const sessions = buildSessions(movements, docMap);
    return sessions.find((s) => s.openedAt === sessionOpenedAt)?.total ?? 0;
  }
}

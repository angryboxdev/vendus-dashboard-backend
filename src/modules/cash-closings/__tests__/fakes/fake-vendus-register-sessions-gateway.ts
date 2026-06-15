import type { RegisterSession } from "../../domain/entities/register-session.js";
import type { VendusRegisterSessionsGatewayPort } from "../../domain/ports/out/vendus-register-sessions-gateway.port.js";

export class FakeVendusRegisterSessionsGateway implements VendusRegisterSessionsGatewayPort {
  private sessionsByDate = new Map<string, RegisterSession[]>();
  shouldFail = false;

  addSession(date: string, session: RegisterSession): void {
    const existing = this.sessionsByDate.get(date) ?? [];
    existing.push(session);
    this.sessionsByDate.set(date, existing);
  }

  async getSessionsForDate(date: string): Promise<RegisterSession[]> {
    if (this.shouldFail) throw new Error("Vendus API unavailable");
    return this.sessionsByDate.get(date) ?? [];
  }

  async getSessionTotal(date: string, sessionOpenedAt: string): Promise<number> {
    if (this.shouldFail) throw new Error("Vendus API unavailable");
    const sessions = this.sessionsByDate.get(date) ?? [];
    return sessions.find((s) => s.openedAt === sessionOpenedAt)?.total ?? 0;
  }
}

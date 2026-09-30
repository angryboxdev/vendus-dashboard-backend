import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { StockCountSession } from "../../domain/entities/stock-count-session.js";
import { StockCountLine, type StockCountLineStatus } from "../../domain/entities/stock-count-line.js";
import type { StockCountAttempt } from "../../domain/entities/stock-count-attempt.js";
import type { StockCountComponent } from "../../domain/entities/stock-count-component.js";
import { StaleCountLineVersionError, StaleCountSessionVersionError } from "../../domain/errors.js";
import type { StockCountRepositoryPort, StockCountSessionFilter } from "../../domain/ports/out/stock-count-repository.port.js";

/**
 * Repositório fake partilhado entre use cases e o `FakeStockMovementWrite`
 * (que muta este mesmo mapa para simular o efeito das RPCs reais) — evita
 * o bug já visto no módulo irmão de dois fakes independentes não
 * partilharem estado.
 */
export class FakeStockCountRepository implements StockCountRepositoryPort {
  sessions = new Map<string, StockCountSession>();
  lines = new Map<string, StockCountLine>();
  attempts = new Map<string, StockCountAttempt>();
  components = new Map<string, StockCountComponent>();
  private nextSessionNumber = 1;

  seedSession(session: StockCountSession): void {
    this.sessions.set(session.id, session);
  }

  seedLine(line: StockCountLine): void {
    this.lines.set(line.id, line);
  }

  seedAttempt(attempt: StockCountAttempt): void {
    this.attempts.set(attempt.toProps().id, attempt);
  }

  seedComponent(component: StockCountComponent): void {
    this.components.set(component.id, component);
  }

  async findSessionById(organizationId: OrganizationId, id: string): Promise<StockCountSession | null> {
    const session = this.sessions.get(id) ?? null;
    return session && session.organizationId === organizationId ? session : null;
  }

  async findSessionsAll(organizationId: OrganizationId, filter?: StockCountSessionFilter): Promise<StockCountSession[]> {
    return [...this.sessions.values()].filter((s) => {
      if (s.organizationId !== organizationId) return false;
      if (filter?.status && s.status !== filter.status) return false;
      if (filter?.locationId && s.locationId !== filter.locationId) return false;
      return true;
    });
  }

  async insertSession(_organizationId: OrganizationId, session: StockCountSession): Promise<StockCountSession> {
    const props = session.toProps();
    const reconstituted = StockCountSession.reconstitute({ ...props, sessionNumber: this.nextSessionNumber++ });
    this.sessions.set(reconstituted.id, reconstituted);
    return reconstituted;
  }

  async saveSession(_organizationId: OrganizationId, session: StockCountSession, expectedVersion?: number): Promise<void> {
    const existing = this.sessions.get(session.id);
    if (expectedVersion !== undefined && existing && existing.version !== expectedVersion) {
      throw new StaleCountSessionVersionError(existing.version);
    }
    this.sessions.set(session.id, session);
  }

  async findLinesBySessionId(
    _organizationId: OrganizationId,
    sessionId: string,
    filter?: { status?: StockCountLineStatus },
  ): Promise<StockCountLine[]> {
    return [...this.lines.values()].filter((l) => l.sessionId === sessionId && (!filter?.status || l.status === filter.status));
  }

  async findLineById(_organizationId: OrganizationId, lineId: string): Promise<StockCountLine | null> {
    return this.lines.get(lineId) ?? null;
  }

  async insertLine(_organizationId: OrganizationId, line: StockCountLine): Promise<StockCountLine> {
    this.lines.set(line.id, line);
    return line;
  }

  async saveLine(_organizationId: OrganizationId, line: StockCountLine, expectedVersion?: number): Promise<void> {
    const existing = this.lines.get(line.id);
    if (expectedVersion !== undefined && existing && existing.version !== expectedVersion) {
      throw new StaleCountLineVersionError(existing.version);
    }
    this.lines.set(line.id, line);
  }

  async findAttemptsByLineId(_organizationId: OrganizationId, lineId: string): Promise<StockCountAttempt[]> {
    return [...this.attempts.values()].filter((a) => a.countLineId === lineId).sort((a, b) => a.attemptNumber - b.attemptNumber);
  }

  async findAttemptById(_organizationId: OrganizationId, attemptId: string): Promise<StockCountAttempt | null> {
    return this.attempts.get(attemptId) ?? null;
  }

  async insertAttempt(_organizationId: OrganizationId, attempt: StockCountAttempt): Promise<StockCountAttempt> {
    this.attempts.set(attempt.toProps().id, attempt);
    return attempt;
  }

  async findComponentsByAttemptId(_organizationId: OrganizationId, attemptId: string): Promise<StockCountComponent[]> {
    return [...this.components.values()].filter((c) => c.attemptId === attemptId);
  }
}

import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { InvalidAuditEvent, validateAuditInput, type AuditEvent, type AuditEventInput, type AuditQuery } from "../../domain/entities/audit-event.js";
import type { AuditQueryPorts, RecordAuditEventPort } from "../../domain/ports/in/audit.ports.js";
import type { AuditContextPort, AuditStorePort } from "../../domain/ports/out/audit-store.port.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class AuditUseCases implements RecordAuditEventPort, AuditQueryPorts {
  constructor(
    private readonly store: AuditStorePort,
    private readonly context: AuditContextPort,
  ) {}

  /**
   * Regista um evento. Se falhar, a exceção sobe e o pedido devolve erro —
   * a alteração já gravada fica sem evento (sem transação entre os dois até
   * ao outbox transacional, ticket 10). O erro fica no log com a correlação.
   */
  async record(orgId: OrganizationId, event: AuditEventInput): Promise<void> {
    validateAuditInput(event);
    await this.store.append(orgId, { ...event, reason: event.reason?.trim() || null, ...this.context.current() });
  }

  async list(orgId: OrganizationId, q: Partial<AuditQuery>): Promise<AuditEvent[]> {
    if ((q.from && !DATE.test(q.from)) || (q.to && !DATE.test(q.to))) throw new InvalidAuditEvent("Datas inválidas (AAAA-MM-DD).");
    const limit = Math.min(Math.max(Math.trunc(q.limit ?? 100), 1), 1000);
    return this.store.query(orgId, { ...q, limit });
  }

  async verify(orgId: OrganizationId) {
    const brokenAtSeq = await this.store.verify(orgId);
    return { intact: brokenAtSeq === null, brokenAtSeq };
  }
}

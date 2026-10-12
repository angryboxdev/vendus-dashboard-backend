import { currentRequestContext } from "../../../../infra/http/correlation.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { AuditEvent, AuditEventInput, AuditQuery, AuditRequestContext } from "../../domain/entities/audit-event.js";
import type { AuditContextPort, AuditStorePort } from "../../domain/ports/out/audit-store.port.js";

interface Row {
  id: string;
  seq: number;
  occurred_at: string;
  actor: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  ip: string | null;
  user_agent: string | null;
  correlation_id: string | null;
  prev_hash: string | null;
  hash: string;
}

const COLS = "id, seq, occurred_at, actor, action, resource_type, resource_id, before, after, reason, ip, user_agent, correlation_id, prev_hash, hash";

const toEvent = (r: Row): AuditEvent => ({
  id: r.id,
  seq: Number(r.seq),
  occurredAt: r.occurred_at,
  actor: r.actor,
  action: r.action,
  resourceType: r.resource_type,
  resourceId: r.resource_id,
  before: r.before,
  after: r.after,
  reason: r.reason,
  ip: r.ip,
  userAgent: r.user_agent,
  correlationId: r.correlation_id,
  prevHash: r.prev_hash,
  hash: r.hash,
});

/** `audit_events`: seq, data e hash são postos pelo trigger da BD. */
export class SupabaseAuditStore implements AuditStorePort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async append(orgId: OrganizationId, e: AuditEventInput & AuditRequestContext): Promise<AuditEvent> {
    const res = await this.scoped(orgId)
      .table("audit_events")
      .insert({
        actor: e.actor,
        action: e.action,
        resource_type: e.resourceType,
        resource_id: e.resourceId,
        before: e.before ?? null,
        after: e.after ?? null,
        reason: e.reason,
        ip: e.ip,
        user_agent: e.userAgent,
        correlation_id: e.correlationId,
        // seq/hash: obrigatórios na tabela, substituídos pelo trigger.
        seq: 0,
        hash: "-",
      })
      .select(COLS)
      .single();
    if (res.error) throw new Error(res.error.message);
    return toEvent(res.data as unknown as Row);
  }

  async query(orgId: OrganizationId, q: AuditQuery): Promise<AuditEvent[]> {
    let b = this.scoped(orgId).table("audit_events").select(COLS);
    if (q.resourceType) b = b.eq("resource_type", q.resourceType);
    if (q.resourceId) b = b.eq("resource_id", q.resourceId);
    if (q.action) b = b.eq("action", q.action);
    if (q.from) b = b.gte("occurred_at", `${q.from}T00:00:00Z`);
    if (q.to) b = b.lt("occurred_at", `${q.to}T23:59:59.999Z`);
    if (q.beforeSeq) b = b.lt("seq", q.beforeSeq);
    const res = await b.order("seq", { ascending: false }).limit(q.limit);
    if (res.error) throw new Error(res.error.message);
    return ((res.data ?? []) as unknown as Row[]).map(toEvent);
  }

  async verify(orgId: OrganizationId): Promise<number | null> {
    const res = await this.scoped(orgId).verifyAuditChain();
    if (res.error) throw new Error(res.error.message);
    return (res.data as number | null) ?? null;
  }
}

/** IP, dispositivo e correlação do pedido em curso (middleware `correlationId`). */
export class HttpAuditContext implements AuditContextPort {
  current(): AuditRequestContext {
    const c = currentRequestContext();
    return { ip: c?.ip ?? null, userAgent: c?.userAgent ?? null, correlationId: c?.correlationId ?? null };
  }
}

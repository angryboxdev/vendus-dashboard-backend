import type { ScopedQueryFactory } from "../scoped-db/scoped-query.js";
import type { IdempotencyBegin, IdempotencyScope, IdempotencyStore, StoredResponse } from "./idempotency.js";

interface Row {
  fingerprint: string;
  status: number | null;
  headers: StoredResponse["headers"];
  body: string | null;
  expires_at: string;
}

/**
 * Idempotency-Key persistente (`http_idempotency_keys`, ADR-0022): sobrevive
 * a reinícios e funciona com várias instâncias. A reserva é atómica — o
 * insert com `ignoreDuplicates` só devolve a linha a quem a criou.
 * Só para rotas autenticadas (precisa da organização).
 */
export class SupabaseIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly scoped: ScopedQueryFactory,
    private readonly ttlHours = 24,
  ) {}

  async begin(s: IdempotencyScope, fingerprint: string): Promise<IdempotencyBegin> {
    const q = this.table(s);
    for (let attempt = 0; attempt < 2; attempt++) {
      const expiresAt = new Date(Date.now() + this.ttlHours * 3_600_000).toISOString();
      const ins = await q.upsert({ scope: s.key, fingerprint, expires_at: expiresAt }, { onConflict: "org_id,scope", ignoreDuplicates: true }).select("scope");
      if (ins.error) throw new Error(ins.error.message);
      if ((ins.data ?? []).length > 0) return { state: "new" };

      const cur = await q.select("fingerprint, status, headers, body, expires_at").eq("scope", s.key).maybeSingle();
      if (cur.error) throw new Error(cur.error.message);
      const row = cur.data as unknown as Row | null;
      if (!row) continue; // apagada entretanto — tentar reservar outra vez
      if (Date.parse(row.expires_at) <= Date.now()) {
        const del = await q.delete().eq("scope", s.key);
        if (del.error) throw new Error(del.error.message);
        continue;
      }
      if (row.fingerprint !== fingerprint) return { state: "mismatch" };
      if (row.status === null) return { state: "in_progress" };
      return { state: "done", response: { status: row.status, headers: row.headers ?? {}, body: row.body ?? "" } };
    }
    return { state: "in_progress" };
  }

  async complete(s: IdempotencyScope, response: StoredResponse): Promise<void> {
    const res = await this.table(s).update({ status: response.status, headers: response.headers, body: response.body }).eq("scope", s.key);
    if (res.error) throw new Error(res.error.message);
  }

  async abandon(s: IdempotencyScope): Promise<void> {
    const res = await this.table(s).delete().eq("scope", s.key);
    if (res.error) throw new Error(res.error.message);
  }

  private table(s: IdempotencyScope) {
    if (!s.orgId) throw new Error("Idempotency-Key persistente exige um pedido autenticado (organização).");
    return this.scoped(s.orgId).table("http_idempotency_keys");
  }
}

import { SupabaseNotificationStore } from "../adapters/out/supabase-notification.store.js";
import { ScopedQuery } from "../../../infra/scoped-db/scoped-query.js";
import { mintOrganizationId } from "../../../kernel/organization-id.js";

/**
 * Regressão: o índice de duplicados de `notifications` é parcial
 * (`where dedupe_key is not null`) e um `upsert ... onConflict` contra ele
 * falha no Postgres (42P10) — publicar uma escala dava «Erro interno» quando
 * havia destinatários. O cliente falso imita essa tabela: recusa `upsert`,
 * aplica a unicidade parcial e devolve 23505 em duplicados.
 */
type Stored = { org_id: string; recipient_user_id: string; dedupe_key: string | null };

function fakeClient(initial: Stored[] = []) {
  const rows = [...initial];
  const calls: string[] = [];
  const clash = (r: Stored, pool: Stored[]) => r.dedupe_key !== null && pool.some((x) => x.org_id === r.org_id && x.recipient_user_id === r.recipient_user_id && x.dedupe_key === r.dedupe_key);
  const client = {
    from() {
      return {
        upsert() {
          calls.push("upsert");
          return { select: async () => ({ data: null, error: { message: "there is no unique or exclusion constraint matching the ON CONFLICT specification", code: "42P10" } }) };
        },
        insert(values: Stored | Stored[]) {
          calls.push("insert");
          const list = Array.isArray(values) ? values : [values];
          return {
            select: async () => {
              const batch: Stored[] = [];
              for (const v of list) {
                if (clash(v, rows) || clash(v, batch)) return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
                batch.push(v);
              }
              rows.push(...batch);
              return { data: batch.map((_, i) => ({ id: `n${rows.length + i}` })), error: null };
            },
          };
        },
        select() {
          calls.push("select");
          const filters: Record<string, unknown[]> = {};
          let org: unknown;
          const b = {
            eq(_c: string, v: unknown) {
              org = v;
              return b;
            },
            in(c: string, v: unknown[]) {
              filters[c] = v;
              return b;
            },
            then(resolve: (r: { data: Stored[]; error: null }) => unknown) {
              const data = rows.filter((r) => r.org_id === org && Object.entries(filters).every(([c, v]) => v.includes(r[c as keyof Stored])));
              return Promise.resolve({ data, error: null }).then(resolve);
            },
          };
          return b;
        },
      };
    },
  };
  return { client, rows, calls };
}

const ORG = mintOrganizationId("org-a");
const store = (client: unknown) => new SupabaseNotificationStore((o) => ScopedQuery.create(o, client as Parameters<typeof ScopedQuery.create>[1]));
const row = (recipientUserId: string, dedupeKey: string | null) => ({ recipientUserId, kind: "rosters.change", title: "Escala publicada", body: null, link: "/hr/novo/escalas", dedupeKey });

describe("SupabaseNotificationStore.insert", () => {
  it("com chave de duplicados não usa upsert e grava a notificação", async () => {
    const f = fakeClient();
    expect(await store(f.client).insert(ORG, [row("u1", "roster:r1:2")])).toBe(1);
    expect(f.calls).not.toContain("upsert");
    expect(f.rows).toHaveLength(1);
  });

  it("ignora o que já existe e os repetidos no mesmo pedido", async () => {
    const f = fakeClient([{ org_id: "org-a", recipient_user_id: "u1", dedupe_key: "roster:r1:2" }]);
    expect(await store(f.client).insert(ORG, [row("u1", "roster:r1:2"), row("u2", "roster:r1:2"), row("u2", "roster:r1:2")])).toBe(1);
    expect(f.rows.map((r) => r.recipient_user_id)).toEqual(["u1", "u2"]);
  });

  it("sem chave de duplicados grava sempre", async () => {
    const f = fakeClient([{ org_id: "org-a", recipient_user_id: "u1", dedupe_key: null }]);
    expect(await store(f.client).insert(ORG, [row("u1", null), row("u1", null)])).toBe(2);
  });
});

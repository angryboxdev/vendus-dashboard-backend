import { ScopedQuery } from "../../../../infra/scoped-db/scoped-query.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { SupabaseAtCredentials } from "../../adapters/out/supabase-at-credentials.js";
import { SupabaseAtStore } from "../../adapters/out/supabase-at-store.js";
import { InvoicingRuleError } from "../../domain/errors.js";

const ORG = mintOrganizationId("b6999cff-79b2-4583-b8b4-a744b3ace748");
type Result = { data: unknown; error: { code?: string; message: string } | null };

/** Cliente falso: grava as cadeias de chamadas (tabelas e RPC) e responde pela ordem preparada. */
function fakeClient(results: Record<string, Result[]>) {
  const chains: Array<{ table: string; calls: Array<[string, unknown[]]> }> = [];
  const next = (key: string) => Promise.resolve(results[key]?.shift() ?? { data: null, error: null });
  const client = {
    from(table: string) {
      const chain = { table, calls: [] as Array<[string, unknown[]]> };
      chains.push(chain);
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "insert", "update", "upsert", "delete", "eq", "order"]) builder[m] = (...args: unknown[]) => (chain.calls.push([m, args]), builder);
      builder.maybeSingle = () => (chain.calls.push(["maybeSingle", []]), next(table));
      builder.then = (ok: (v: Result) => unknown, ko: (e: unknown) => unknown) => next(table).then(ok, ko);
      return builder;
    },
    rpc(fn: string, args: unknown) {
      chains.push({ table: `rpc:${fn}`, calls: [["rpc", [args]]] });
      return next(`rpc:${fn}`);
    },
  };
  return { client, chains };
}
const scopedWith = (client: unknown) => (org: typeof ORG) => ScopedQuery.create(org, client as Parameters<typeof ScopedQuery.create>[1]);

describe("SupabaseAtStore", () => {
  it("fila pela função da BD, com a organização e o ambiente", async () => {
    const row = {
      document_id: "d1",
      legal_entity_id: "le-1",
      document_number: "FS L01-2027/1",
      document_type: "FS",
      document_date: "2027-03-10",
      status: "N",
      accepted_status: null,
      failures: 2,
      last_attempt_at: "2027-03-10T12:00:00Z",
      last_outcome: "failed",
      last_code: -99,
      last_message: "Erro",
    };
    const { client, chains } = fakeClient({ "rpc:fn_invoicing_at_queue": [{ data: [row], error: null }] });
    const items = await new SupabaseAtStore(scopedWith(client)).queue(ORG, "test", 50);
    expect(chains[0]!.calls[0]![1][0]).toEqual({ p_org_id: ORG, p_environment: "test", p_limit: 50 });
    expect(items).toEqual([
      { documentId: "d1", legalEntityId: "le-1", documentNumber: "FS L01-2027/1", documentType: "FS", documentDate: "2027-03-10", status: "N", acceptedStatus: null, failures: 2, lastAttemptAt: "2027-03-10T12:00:00Z", lastOutcome: "failed", lastCode: -99, lastMessage: "Erro" },
    ]);
  });

  it("regista a comunicação com a organização carimbada", async () => {
    const { client, chains } = fakeClient({});
    await new SupabaseAtStore(scopedWith(client)).record(ORG, { documentId: "d1", environment: "test", operation: "register", documentStatus: "N", outcome: "accepted", code: 0, message: "ok", actor: "u1" });
    expect(chains[0]!.table).toBe("invoicing_at_communications");
    expect(chains[0]!.calls.find(([m]) => m === "insert")![1][0]).toEqual({
      org_id: ORG,
      document_id: "d1",
      environment: "test",
      operation: "register",
      document_status: "N",
      outcome: "accepted",
      response_code: 0,
      response_message: "ok",
      actor: "u1",
    });
  });

  it("série que a BD recusa mudar de estado → erro de regra", async () => {
    const { client } = fakeClient({ invoicing_series: [{ data: null, error: { code: "P0001", message: "invoicing_series: só se anula uma série sem documentos" } }] });
    await expect(new SupabaseAtStore(scopedWith(client)).setSeriesStatus(ORG, "s1", "cancelled")).rejects.toBeInstanceOf(InvoicingRuleError);
  });
});

describe("SupabaseAtCredentials", () => {
  const cipher = { encrypt: (v: string) => `cifrado(${v})`, decrypt: (v: string) => v.replace(/^cifrado\((.*)\)$/, "$1") };

  it("grava a senha cifrada (upsert por organização, emitente e ambiente)", async () => {
    const { client, chains } = fakeClient({});
    await new SupabaseAtCredentials(scopedWith(client), cipher).save(ORG, "test", "le-1", { username: "599999999/37", password: "s3gredo" }, "u1");
    const [row, opts] = chains[0]!.calls.find(([m]) => m === "upsert")![1] as [Record<string, unknown>, unknown];
    expect(row).toMatchObject({ org_id: ORG, legal_entity_id: "le-1", environment: "test", username: "599999999/37", password_encrypted: "cifrado(s3gredo)", updated_by: "u1" });
    expect(JSON.stringify(row)).not.toContain('"s3gredo"');
    expect(opts).toEqual({ onConflict: "org_id,legal_entity_id,environment" });
  });

  it("lê e decifra só para o envio; a listagem não traz a senha", async () => {
    const { client, chains } = fakeClient({
      invoicing_at_credentials: [
        { data: { username: "599999999/37", password_encrypted: "cifrado(s3gredo)", updated_at: "2027-03-01T00:00:00Z" }, error: null },
        { data: [{ legal_entity_id: "le-1", username: "599999999/37", updated_at: "2027-03-01T00:00:00Z" }], error: null },
      ],
    });
    const store = new SupabaseAtCredentials(scopedWith(client), cipher);
    expect(await store.get(ORG, "test", "le-1")).toEqual({ username: "599999999/37", password: "s3gredo", updatedAt: "2027-03-01T00:00:00Z" });
    expect(await store.list(ORG, "test")).toEqual([{ legalEntityId: "le-1", username: "599999999/37", updatedAt: "2027-03-01T00:00:00Z" }]);
    expect(chains[1]!.calls.find(([m]) => m === "select")![1][0]).not.toContain("password");
  });
});

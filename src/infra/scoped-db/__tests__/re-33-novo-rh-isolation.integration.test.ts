import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mintOrganizationId, type OrganizationId } from "../../../kernel/organization-id.js";

/**
 * RE-33 com duas organizações reais (stack Supabase local: `supabase start`
 * + `supabase db reset`). Cria uma organização B, escreve dados do Novo RH
 * na A e confirma que pela B não se lê nem se altera nada.
 *
 * Credenciais do stack local por variáveis de ambiente (nunca no código):
 *   TEST_SUPABASE_URL (omissão http://127.0.0.1:54321)
 *   TEST_SUPABASE_SERVICE_ROLE_KEY (o "service_role key" que `supabase status` mostra)
 * Sem a chave, o teste falha a explicar o que falta — não passa em silêncio.
 * Fica fora do `test:unit` (sufixo .integration.test.ts).
 */
const URL = process.env.TEST_SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";

const localClient: SupabaseClient | null = KEY ? createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

jest.mock("../supabase-client.js", () => ({
  getSupabaseServiceRole: () => localClient,
  getSupabase: () => localClient,
  isSupabaseConfigured: () => true,
  isHrSupabaseConfigured: () => true,
}));

const ORG_A = mintOrganizationId("b6999cff-79b2-4583-b8b4-a744b3ace748"); // Angrybox (seed local)

describe("RE-33 — isolamento entre organizações (integração, Novo RH)", () => {
  let ORG_B: OrganizationId;
  let scoped: (org: OrganizationId) => import("../scoped-query.js").ScopedQuery;

  beforeAll(async () => {
    if (!localClient) throw new Error("Defina TEST_SUPABASE_SERVICE_ROLE_KEY (supabase status) para correr o teste de isolamento.");
    const { createScopedQuery } = await import("../scoped-query.js");
    scoped = createScopedQuery;
    const nif = String(900000000 + Math.floor(Math.random() * 99999999)).slice(0, 9);
    const { data, error } = await localClient.from("organizations").insert({ name: `Org isolamento ${nif}`, nif }).select("id").single();
    if (error) throw new Error(error.message);
    ORG_B = mintOrganizationId((data as { id: string }).id);
  });

  test("RE_33_configuracoes_estrutura_e_auditoria_da_organizacao_A_sao_invisiveis_e_imutaveis_para_B", async () => {
    const a = scoped(ORG_A);
    const b = scoped(ORG_B);
    const tag = randomUUID().slice(0, 8);

    const prof = await a.table("setting_profiles").insert({ domain: "security", name: `Isolamento ${tag}`, kind: "segment", created_by: "teste" }).select("id").single();
    expect(prof.error).toBeNull();
    const profileId = (prof.data as { id: string }).id;
    const dep = await a.table("org_departments").insert({ name: `Dep ${tag}`, created_by: "teste" }).select("id").single();
    expect(dep.error).toBeNull();
    const depId = (dep.data as { id: string }).id;
    const ev = await a.table("audit_events").insert({ actor: "teste", action: "test.isolation.write", resource_type: "test", resource_id: tag, seq: 0, hash: "-" }).select("id").single();
    expect(ev.error).toBeNull();

    // Leitura pela B: nada.
    for (const [table, id] of [
      ["setting_profiles", profileId],
      ["org_departments", depId],
    ] as const) {
      const r = await b.table(table).select("id").eq("id", id);
      expect(r.error).toBeNull();
      expect(r.data).toEqual([]);
    }
    expect((await b.table("audit_events").select("id").eq("resource_id", tag)).data).toEqual([]);

    // Alteração pela B com o id da A: zero linhas.
    const upd = await b.table("org_departments").update({ name: "pirata" }).eq("id", depId).select("id");
    expect(upd.data).toEqual([]);
    const still = await a.table("org_departments").select("name").eq("id", depId).single();
    expect((still.data as { name: string }).name).toBe(`Dep ${tag}`);

    // Valor de configuração da B a apontar para um perfil da A: recusado pela chave composta (org_id, profile_id).
    const cross = await b.table("setting_values").insert({ profile_id: profileId, key: "security.session.inactivity_minutes", value: 5, valid_from: "2026-10-11", reason: "x", created_by: "teste" });
    expect(cross.error).not.toBeNull();
  });
});

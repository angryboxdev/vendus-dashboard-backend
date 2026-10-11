import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TABLE_REGISTRY } from "../table-registry.js";

/**
 * RE-33 (parte estrutural, corre na CI sem base de dados): todas as tabelas
 * criadas pelas migrações do Novo RH têm `org_id` obrigatório, RLS ligada,
 * política por organização (`current_org()`) e estão no registo do helper
 * de queries — o único sítio que constrói queries (ADR-0008), que filtra
 * sempre por organização. O teste com duas organizações reais está em
 * `re-33-novo-rh-isolation.integration.test.ts` (stack local).
 */
const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const files = readdirSync(MIGRATIONS).filter((f) => /_novo_rh_.*\.sql$/.test(f));

function tablesOf(sql: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /create table if not exists public\.([a-z_]+) \(([\s\S]*?)\n\);/g;
  for (const m of sql.matchAll(re)) out.push({ name: m[1]!, body: m[2]! });
  return out;
}

describe("RE-33 — isolamento entre organizações (estrutura das tabelas do Novo RH)", () => {
  const all = files.flatMap((f) => tablesOf(readFileSync(join(MIGRATIONS, f), "utf8")).map((t) => ({ ...t, file: f, sql: readFileSync(join(MIGRATIONS, f), "utf8") })));

  test("há migrações e tabelas do Novo RH para verificar", () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
    expect(all.length).toBeGreaterThanOrEqual(10);
  });

  test.each(all.map((t) => [t.name, t] as const))("RE_33_%s_tem_org_id_rls_politica_por_organizacao_e_helper", (name, t) => {
    expect(t.body).toMatch(/\borg_id uuid not null references public\.organizations\(id\)/);
    expect(t.sql).toContain(`alter table public.${name} enable row level security;`);
    expect(t.sql).toMatch(new RegExp(`create policy "[^"]+" on public\\.${name}[\\s\\S]*?org_id = current_org\\(\\)`));
    expect(TABLE_REGISTRY).toHaveProperty(name);
    expect((TABLE_REGISTRY as Record<string, { organizationColumn: string }>)[name]!.organizationColumn).toBe("org_id");
  });
});

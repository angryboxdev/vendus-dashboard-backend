import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TABLE_REGISTRY } from "../../../../infra/scoped-db/table-registry.js";

/**
 * Estrutura da BD da faturação certificada, verificada sem base de dados (CI).
 * O comportamento real (corrida, triggers a recusar) está em
 * `supabase-invoicing-store.integration.test.ts` (stack local do Supabase).
 */
const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const ROLLBACKS = join(process.cwd(), "docs/migrations/rollback");
const files = readdirSync(MIGRATIONS).filter((f) => /^\d{14}_invoicing_.*\.sql$/.test(f));
const sql = files.map((f) => readFileSync(join(MIGRATIONS, f), "utf8")).join("\n");

const TABLES = ["invoicing_series", "invoicing_documents", "invoicing_document_lines", "invoicing_document_taxes", "invoicing_events"];
/** Tabelas em que nada se altera nem apaga depois de escrito. */
const APPEND_ONLY = ["invoicing_document_lines", "invoicing_document_taxes", "invoicing_events"];
const RPCS = ["invoicing_issue_document", "invoicing_cancel_document"];

const tableBody = (name: string) => new RegExp(`create table if not exists public\\.${name} \\(([\\s\\S]*?)\\n\\);`).exec(sql)?.[1];

describe("migração da faturação certificada (estrutura)", () => {
  test("existe migração com rollback", () => {
    expect(files.length).toBeGreaterThanOrEqual(1);
    for (const f of files) expect(existsSync(join(ROLLBACKS, f))).toBe(true);
  });

  test.each(TABLES)("%s: org_id obrigatório, RLS por organização e registo no helper", (name) => {
    const body = tableBody(name);
    expect(body).toBeDefined();
    expect(body).toMatch(/\borg_id uuid not null references public\.organizations\(id\)/);
    expect(sql).toContain(`alter table public.${name} enable row level security;`);
    expect(sql).toMatch(new RegExp(`create policy "[^"]+" on public\\.${name}[\\s\\S]*?org_id = current_org\\(\\)`));
    expect((TABLE_REGISTRY as Record<string, { organizationColumn: string }>)[name]?.organizationColumn).toBe("org_id");
  });

  test.each(APPEND_ONLY)("%s não aceita UPDATE nem DELETE", (name) => {
    expect(sql).toMatch(new RegExp(`create trigger \\w+ before update or delete on public\\.${name}\\b`));
  });

  test("documentos emitidos: sem DELETE e UPDATE só para a mudança de estado (Despacho 1.11, 2.1)", () => {
    expect(sql).toMatch(/create trigger \w+ before update or delete on public\.invoicing_documents\b/);
  });

  test("séries: não se apagam (Despacho 1.9) e o fim da cadeia só muda pela emissão", () => {
    expect(sql).toMatch(/create trigger \w+ before update or delete on public\.invoicing_series\b/);
  });

  test.each(RPCS)("%s: security definer, search_path fixo, só para a service role", (fn) => {
    expect(sql).toMatch(new RegExp(`create or replace function public\\.${fn}\\([\\s\\S]*?security definer[\\s\\S]*?set search_path to 'public'`));
    expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`));
    expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role;`));
  });
});

// Aplica a cadeia completa de migrações num Postgres real (PGlite) com stubs do Supabase.
// Uso: node apply-chain.mjs <pasta-migrations> [--stop-before <versão>]
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const STUBS = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then create role supabase_storage_admin nologin; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create or replace function auth.role() returns text language sql stable as $f$ select current_setting('request.jwt.claim.role', true) $f$;
create or replace function auth.jwt() returns jsonb language sql stable as $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now());
create or replace function storage.foldername(name text) returns text[] language sql immutable as $f$ select string_to_array(name, '/') $f$;
`;

export function migrationFiles(dir) {
  return readdirSync(dir).filter((f) => /^\d+.*\.sql$/.test(f)).sort();
}

export async function applyChain(db, dir, { stopBefore } = {}) {
  await db.exec(STUBS);
  for (const f of migrationFiles(dir)) {
    if (stopBefore && f >= stopBefore) break;
    try {
      await db.exec(readFileSync(join(dir, f), "utf8").replace(/\b(index)\s+concurrently\b/gi, "$1"));
    } catch (e) {
      throw new Error(`${f}: ${e.message}`);
    }
  }
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const db = new PGlite();
  await applyChain(db, process.argv[2]);
  console.log("cadeia aplicada:", migrationFiles(process.argv[2]).length, "migrações");
}

/**
 * Gera o bloco `values (...)` dos perfis de sistema para a migração
 * `20261008110000_access_profiles.sql` a partir do catálogo em código
 * (`src/modules/access/domain/catalog.ts`). Uso:
 *   npx tsx scripts/generate-access-profiles-seed.ts
 * O teste `access-profiles-seed.test.ts` garante que a migração e o
 * catálogo não divergem.
 */
import { SYSTEM_PROFILE_DEFAULTS } from "../src/modules/access/domain/catalog.js";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const rows = Object.entries(SYSTEM_PROFILE_DEFAULTS).map(([key, p]) => {
  const sorted = Object.fromEntries(Object.entries(p.permissions).sort(([a], [b]) => a.localeCompare(b)));
  return `    (${q(key)}, ${q(p.name)}, ${q(p.description)}, ${p.protected}, ${q(JSON.stringify(sorted))}::jsonb)`;
});
console.log(rows.join(",\n"));

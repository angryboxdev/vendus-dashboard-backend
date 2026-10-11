import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { buildMatrix, renderMarkdown } from "./authz-matrix.js";
import { scanRoutes, type SourceFile } from "./route-inventory.js";

/**
 * `npm run authz:matrix` — escreve docs/matriz-autorizacao.md.
 * Sai com código 1 se houver endpoints autenticados não classificados.
 */
const root = process.cwd();

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return d.name === "__tests__" ? [] : walk(p);
    return p.endsWith(".ts") ? [p] : [];
  });
}

// Só módulos que o servidor monta (ex.: o módulo de referência `tasks` não é montado).
const server = readFileSync(join(root, "src/server.ts"), "utf8");
const mounted = new Set([...server.matchAll(/modules\/([\w-]+)\//g)].map((m) => m[1]));
const moduleFiles = walk(join(root, "src/modules")).filter((p) => {
  const m = /modules[\\/]([\w-]+)[\\/]adapters[\\/]in[\\/]/.exec(p);
  return !!m && mounted.has(m[1]);
});
const candidates = [...walk(join(root, "src/routes")), ...moduleFiles];
const files: SourceFile[] = candidates.map((p) => ({ file: relative(root, p).replace(/\\/g, "/"), content: readFileSync(p, "utf8") }));
const rows = buildMatrix(scanRoutes(files));
writeFileSync(join(root, "docs/matriz-autorizacao.md"), renderMarkdown(rows, new Date().toISOString().slice(0, 10)));

const unclassified = rows.filter((r) => r.rule === "NÃO CLASSIFICADA");
console.log(`docs/matriz-autorizacao.md: ${rows.length} endpoints, ${unclassified.length} não classificados`);
for (const r of unclassified) console.log(`  NÃO CLASSIFICADA: ${r.method} ${r.path}`);
process.exitCode = unclassified.length ? 1 : 0;

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildMatrix, renderMarkdown } from "./authz-matrix.js";
import { scanRoutes } from "./route-inventory.js";
import { collectRouteSources } from "./source-files.js";

/**
 * `npm run authz:matrix` — escreve docs/matriz-autorizacao.md.
 * Sai com código 1 se houver endpoints autenticados não classificados.
 */
const root = process.cwd();
const rows = buildMatrix(scanRoutes(collectRouteSources(root)));
writeFileSync(join(root, "docs/matriz-autorizacao.md"), renderMarkdown(rows, new Date().toISOString().slice(0, 10)));

const unclassified = rows.filter((r) => r.rule === "NÃO CLASSIFICADA");
console.log(`docs/matriz-autorizacao.md: ${rows.length} endpoints, ${unclassified.length} não classificados`);
for (const r of unclassified) console.log(`  NÃO CLASSIFICADA: ${r.method} ${r.path}`);
process.exitCode = unclassified.length ? 1 : 0;

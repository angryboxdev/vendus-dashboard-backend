import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { SourceFile } from "./route-inventory.js";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return d.name === "__tests__" ? [] : walk(p);
    return p.endsWith(".ts") ? [p] : [];
  });
}

/** Ficheiros com rotas: `src/routes` + adapters de entrada dos módulos que o `server.ts` monta. */
export function collectRouteSources(root: string): SourceFile[] {
  // Só módulos que o servidor monta (ex.: o módulo de referência `tasks` não é montado).
  const server = readFileSync(join(root, "src/server.ts"), "utf8");
  const mounted = new Set([...server.matchAll(/modules\/([\w-]+)\//g)].map((m) => m[1]));
  const moduleFiles = walk(join(root, "src/modules")).filter((p) => {
    const m = /modules[\\/]([\w-]+)[\\/]adapters[\\/]in[\\/]/.exec(p);
    return !!m && mounted.has(m[1]);
  });
  return [...walk(join(root, "src/routes")), ...moduleFiles].map((p) => ({ file: relative(root, p).replace(/\\/g, "/"), content: readFileSync(p, "utf8") }));
}

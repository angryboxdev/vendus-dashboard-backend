/**
 * Inventário estático das rotas HTTP (task RH, Fase 0 — gerador da matriz
 * de autorização, TK-5). Lê o código-fonte em vez de arrancar o servidor
 * (que precisa de BD no arranque). Pura: recebe o conteúdo dos ficheiros.
 *
 * Reconhece `<router>.<método>(<caminho>, …)` com caminho em literal ou em
 * template que use constantes `const X = "…"` do mesmo ficheiro. O prefixo de
 * montagem e se a rota está antes da autenticação vêm de `mountOf()`, que
 * espelha `src/server.ts` — ao mudar a montagem lá, mudar aqui.
 */

export interface RouteEntry {
  method: string;
  /** Caminho completo, com parâmetros no formato Express (`:id`). */
  path: string;
  file: string;
  /** Montada antes de `requireAuth` (quiosque, dispositivos, públicas, cron) — fora do guarda de rotas. */
  preAuth: boolean;
}

export interface SourceFile {
  /** Caminho relativo à raiz do repositório, com `/`. */
  file: string;
  content: string;
}

const PRE_AUTH_ROUTERS = new Set(["publicRouter", "deviceRouter"]);

/** Prefixo de montagem e se o ficheiro inteiro é pré-autenticação. */
export function mountOf(file: string): { prefix: string; preAuth: boolean } {
  if (file === "src/routes/hrKioskRoutes.ts") return { prefix: "/api/hr", preAuth: true };
  if (/^src\/routes\/hr[A-Za-z]*Routes\.ts$/.test(file)) return { prefix: "/api/hr", preAuth: false };
  if (file === "src/routes/authRoutes.ts") return { prefix: "/api/auth", preAuth: false };
  if (file === "src/routes/internalCronRoutes.ts") return { prefix: "/api", preAuth: true };
  if (file.startsWith("src/modules/kds/")) return { prefix: "/api", preAuth: true };
  return { prefix: "/api", preAuth: false };
}

const CALL = /\b(\w+)\.(get|post|put|patch|delete)\(\s*(["'`])((?:(?!\3)[^\\]|\\.)*)\3/g;
const CONST = /\bconst\s+([A-Za-z_]\w*)\s*=\s*(["'`])([^"'`$]*)\2/g;

export function scanRoutes(files: SourceFile[]): RouteEntry[] {
  const out: RouteEntry[] = [];
  for (const { file, content } of files) {
    const consts = new Map<string, string>();
    for (const m of content.matchAll(CONST)) consts.set(m[1]!, m[3]!);
    const { prefix, preAuth } = mountOf(file);
    for (const m of content.matchAll(CALL)) {
      const routerName = m[1]!;
      let path = m[4]!;
      if (m[3] === "`") path = path.replace(/\$\{(\w+)\}/g, (_, name: string) => consts.get(name) ?? `\${${name}}`);
      if (!path.startsWith("/") || path.includes("${")) continue;
      out.push({ method: m[2]!.toUpperCase(), path: prefix + path, file, preAuth: preAuth || PRE_AUTH_ROUTERS.has(routerName) });
    }
    // Rotas com constante sem template: router.get(BASE, …)
    for (const m of content.matchAll(/\b(\w+)\.(get|post|put|patch|delete)\(\s*([A-Z_][A-Z0-9_]*)\s*,/g)) {
      const path = consts.get(m[3]!);
      if (!path?.startsWith("/")) continue;
      out.push({ method: m[2]!.toUpperCase(), path: prefix + path, file, preAuth: preAuth || PRE_AUTH_ROUTERS.has(m[1]!) });
    }
  }
  const seen = new Set<string>();
  return out
    .filter((r) => {
      const k = `${r.method} ${r.path}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

/** Caminho concreto para classificar: `:id` → um valor de exemplo. */
export function samplePath(path: string): string {
  return path.replace(/:(\w+)\??/g, "x1");
}

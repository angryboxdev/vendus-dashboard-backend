import { SYSTEM_PROFILE_DEFAULTS, type SystemProfileKey } from "../../modules/access/domain/catalog.js";
import { classifyRoute, isRouteAllowed, type RouteSubject } from "../../modules/access/domain/route-permissions.js";
import { effectivePermissions } from "../../modules/access/domain/services/effective-access.service.js";
import { samplePath, type RouteEntry } from "./route-inventory.js";

/**
 * Matriz papel × endpoint (task RH, Fase 0 → TK-5 na Fase 1). Usa a mesma
 * decisão que o `routeGuard` (`isRouteAllowed`) sobre os perfis de sistema
 * com as permissões por defeito.
 */

export const MATRIX_PROFILES: SystemProfileKey[] = ["admin", "manager", "rh", "financeiro", "colaborador"];

export function subjectFor(profile: SystemProfileKey): RouteSubject {
  const isAdmin = profile === "admin";
  return {
    isAdmin,
    active: true,
    portalOnly: profile === "colaborador",
    permissions: effectivePermissions(SYSTEM_PROFILE_DEFAULTS[profile].permissions, {}, isAdmin),
  };
}

export type Cell = "permitido" | "negado" | "pré-auth";

export interface MatrixRow {
  method: string;
  path: string;
  /** Regra da tabela central: `permission:<chave>:<nível>`, `base`, `admin`, `portal`, `NÃO CLASSIFICADA` ou `pré-auth`. */
  rule: string;
  cells: Record<SystemProfileKey, Cell>;
}

export function buildMatrix(routes: RouteEntry[]): MatrixRow[] {
  return routes.map((r) => {
    const path = samplePath(r.path);
    const cells = {} as Record<SystemProfileKey, Cell>;
    if (r.preAuth) {
      for (const p of MATRIX_PROFILES) cells[p] = "pré-auth";
      return { method: r.method, path: r.path, rule: "pré-auth", cells };
    }
    const { target, level } = classifyRoute(r.method, path);
    const rule = !target ? "NÃO CLASSIFICADA" : target.kind === "permission" ? `permission:${target.key}:${level}` : target.kind;
    for (const p of MATRIX_PROFILES) cells[p] = isRouteAllowed(subjectFor(p), r.method, path) ? "permitido" : "negado";
    return { method: r.method, path: r.path, rule, cells };
  });
}

export function renderMarkdown(rows: MatrixRow[], generatedAt: string): string {
  const unclassified = rows.filter((r) => r.rule === "NÃO CLASSIFICADA");
  const head = ["Método", "Endpoint", "Regra", ...MATRIX_PROFILES].join(" | ");
  const sep = Array(3 + MATRIX_PROFILES.length).fill("---").join(" | ");
  const mark: Record<Cell, string> = { permitido: "✔", negado: "✖", "pré-auth": "—" };
  const lines = rows.map((r) => `| ${[r.method, `\`${r.path}\``, r.rule, ...MATRIX_PROFILES.map((p) => mark[r.cells[p]])].join(" | ")} |`);
  return [
    "# Matriz de autorização (perfil × endpoint)",
    "",
    `> Gerado por \`npm run authz:matrix\` em ${generatedAt}. Não editar à mão.`,
    "> Perfis de sistema com as permissões por defeito; exceções individuais não entram.",
    "> ✔ permitido · ✖ negado (403) · — montada antes da autenticação (quiosque, dispositivos, públicas, cron), fora do guarda.",
    "",
    `Endpoints: ${rows.length} · pré-autenticação: ${rows.filter((r) => r.rule === "pré-auth").length} · não classificados: ${unclassified.length}`,
    "",
    `| ${head} |`,
    `| ${sep} |`,
    ...lines,
    "",
  ].join("\n");
}

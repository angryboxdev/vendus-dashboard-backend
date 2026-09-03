// Regras de fronteira da arquitetura hexagonal.
// Instale: npm i -D dependency-cruiser
// Rode manualmente: npx depcruise src --config .dependency-cruiser.cjs
//
// Estas regras transformam as "regras de dependência inegociáveis" do CLAUDE.md
// em erros verificáveis. O hook PostToolUse roda isto automaticamente.

module.exports = {
  forbidden: [
    {
      name: "domain-nao-importa-adapters",
      comment:
        "O domínio não pode depender de adapters. Se precisa de algo externo, " +
        "declare um output port (interface) e implemente fora.",
      severity: "error",
      from: { path: "src/modules/[^/]+/domain" },
      to: { path: "src/modules/[^/]+/adapters" },
    },
    {
      name: "domain-nao-importa-application",
      comment:
        "O domínio não conhece os use cases que o usam. Dependência aponta para dentro.",
      severity: "error",
      from: { path: "src/modules/[^/]+/domain" },
      to: { path: "src/modules/[^/]+/application" },
    },
    {
      name: "domain-puro-sem-infra",
      comment:
        "O domínio deve ser puro: nada de ORM, client de banco, SDK HTTP, etc.",
      severity: "error",
      from: { path: "src/modules/[^/]+/domain" },
      to: {
        path: "node_modules",
        pathNot:
          // permita aqui libs puras que o domínio pode usar (ex.: validação, datas).
          "node_modules/(zod|date-fns|uuid|ramda)",
      },
    },
    {
      name: "sem-dependencia-circular",
      comment: "Ciclos de import quebram a modularidade.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "kernel-e-puro",
      comment:
        "O shared kernel (src/kernel) não importa nada do resto de src/** — " +
        "isto é o que o impede de se tornar uma gaveta de miscelânea " +
        "(spec B2 ticket 01, D7).",
      severity: "error",
      from: { path: "^src/kernel" },
      to: { path: "^src/(?!kernel)" },
    },
    {
      name: "supabase-so-no-scoped-db",
      comment:
        "Só o folder do scoped-query helper (src/infra/scoped-db) pode importar " +
        "o cliente Supabase — o pacote @supabase/supabase-js ou o factory interno " +
        "(src/infra/scoped-db/supabase-client.ts). Um ficheiro que não consegue " +
        "obter um client não consegue construir uma query sem organização, " +
        "independentemente de aliasing, re-export ou uma chain montada em vários " +
        "statements (ADR-0007/0008, spec B2 D10). Excepção por nome, não por " +
        "folder: runOrganizationProvisioning cria a organização que o escopiaria " +
        "e é inatingível a partir do request path (spec B1 D7) — os outros dois " +
        "jobs escrevem dados de tenant e passam pelo helper como tudo o resto. " +
        "Era warn desde o dia 1 (centenas de violações, os 371 sites ainda por " +
        "converter); promovido a error no ticket 20, a zero violações.",
      severity: "error",
      from: {
        path: "^src",
        pathNot: [
          "^src/infra/scoped-db",
          "^src/jobs/runOrganizationProvisioning\\.ts$",
          "^src/modules/location-credentials/__tests__/integration/supabase-location-credentials\\.integration\\.test\\.ts$",
        ],
      },
      to: {
        path: "(^src/infra/scoped-db/supabase-client\\.ts$|node_modules/@supabase/supabase-js)",
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: { extensions: [".ts", ".tsx", ".js"] },
    // Sem isto, um `import type { SupabaseClient } from "@supabase/supabase-js"`
    // — a forma como a maioria dos adapters hexagonais tipa o client injectado
    // — desaparece antes da compilação (verbatimModuleSyntax) e nunca aparece
    // como aresta de dependência. A regra `supabase-so-no-scoped-db` depende
    // de o ver.
    tsPreCompilationDeps: true,
  },
};

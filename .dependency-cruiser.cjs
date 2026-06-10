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
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: { extensions: [".ts", ".tsx", ".js"] },
  },
};

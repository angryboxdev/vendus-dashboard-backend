import { buildMatrix, renderMarkdown, subjectFor } from "../authz-matrix.js";
import { mountOf, samplePath, scanRoutes } from "../route-inventory.js";
import { isRouteAllowed } from "../../../modules/access/domain/route-permissions.js";

describe("inventário de rotas", () => {
  test("lê literais, templates com constantes e routers pré-autenticação", () => {
    const routes = scanRoutes([
      {
        file: "src/modules/hr/adapters/in/x.controller.ts",
        content: [
          'const BASE = "/hr/leave";',
          "router.get(`${BASE}/board`, h);",
          'router.post(\n  "/hr/leave/absences", h);',
          "this.publicRouter.post('/hr/public-thing', h);",
          "router.get(BASE, h);",
        ].join("\n"),
      },
      { file: "src/routes/hrRoutes.ts", content: 'router.delete("/employees/:id", h);' },
      { file: "src/routes/hrKioskRoutes.ts", content: 'router.post("/kiosk/scan", h);' },
    ]);
    expect(routes.map((r) => `${r.method} ${r.path} ${r.preAuth ? "pre" : "auth"}`)).toEqual([
      "DELETE /api/hr/employees/:id auth",
      "POST /api/hr/kiosk/scan pre",
      "GET /api/hr/leave auth",
      "POST /api/hr/leave/absences auth",
      "GET /api/hr/leave/board auth",
      "POST /api/hr/public-thing pre",
    ]);
  });

  test("expande a variável de um ciclo sobre literais (uma rota por valor)", () => {
    const routes = scanRoutes([
      {
        file: "src/modules/documents/adapters/in/x.controller.ts",
        content: ['for (const base of ["/novo-rh/x", "/hr/x"]) {', "  router.get(`${base}/:id/docs`, h);", "}", "router.get(`${desconhecida}/y`, h);"].join("\n"),
      },
    ]);
    expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /api/hr/x/:id/docs", "GET /api/novo-rh/x/:id/docs"]);
  });

  test("montagem espelha o server.ts", () => {
    expect(mountOf("src/routes/hrLeaveRoutes.ts")).toEqual({ prefix: "/api/hr", preAuth: false });
    expect(mountOf("src/routes/authRoutes.ts").prefix).toBe("/api/auth");
    expect(mountOf("src/routes/internalCronRoutes.ts").preAuth).toBe(true);
    expect(samplePath("/api/hr/employees/:id/documents/:docId?")).toBe("/api/hr/employees/x1/documents/x1");
  });
});

describe("matriz papel × endpoint", () => {
  test("usa a decisão do guarda: admin, permissão, portal, base e não classificada", () => {
    const rows = buildMatrix([
      { method: "GET", path: "/api/users", file: "f", preAuth: false },
      { method: "POST", path: "/api/hr/leave/absences", file: "f", preAuth: false },
      { method: "GET", path: "/api/me/requests", file: "f", preAuth: false },
      { method: "GET", path: "/api/locations", file: "f", preAuth: false },
      { method: "GET", path: "/api/nao-existe", file: "f", preAuth: false },
      { method: "POST", path: "/api/hr/kiosk/scan", file: "f", preAuth: true },
    ]);
    const byPath = Object.fromEntries(rows.map((r) => [r.path, r]));
    expect(byPath["/api/users"]!.cells).toEqual({ admin: "permitido", manager: "negado", rh: "negado", financeiro: "negado", colaborador: "negado" });
    expect(byPath["/api/hr/leave/absences"]!.rule).toBe("permission:hr.leave:MANAGE");
    expect(byPath["/api/hr/leave/absences"]!.cells.financeiro).toBe("negado");
    expect(byPath["/api/hr/leave/absences"]!.cells.rh).toBe("permitido");
    expect(byPath["/api/me/requests"]!.cells.colaborador).toBe("permitido");
    expect(byPath["/api/locations"]!.cells.colaborador).toBe("negado");
    expect(byPath["/api/nao-existe"]!.rule).toBe("NÃO CLASSIFICADA");
    expect(Object.values(byPath["/api/nao-existe"]!.cells).every((c) => c === "negado")).toBe(true);
    expect(byPath["/api/hr/kiosk/scan"]!.cells.admin).toBe("pré-auth");
    expect(renderMarkdown(rows, "2026-10-11")).toContain("não classificados: 1");
  });

  test("conta desativada nunca passa, mesmo admin", () => {
    expect(isRouteAllowed({ ...subjectFor("admin"), active: false }, "GET", "/api/users")).toBe(false);
  });
});

describe("TK-5 — matriz sobre o código real", () => {
  const { collectRouteSources } = jest.requireActual("../source-files.js") as typeof import("../source-files.js");
  const rows = buildMatrix(scanRoutes(collectRouteSources(process.cwd())));
  const row = (method: string, path: string) => rows.find((r) => r.method === method && r.path === path)!;

  test("TK_5_todos_os_endpoints_autenticados_estao_classificados", () => {
    expect(rows.length).toBeGreaterThan(400);
    expect(rows.filter((r) => r.rule === "NÃO CLASSIFICADA").map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  test("TK_5_resultado_esperado_por_perfil_nos_endpoints_do_novo_rh", () => {
    const onlyAdmin = { admin: "permitido", manager: "negado", rh: "negado", financeiro: "negado", colaborador: "negado" };
    expect(row("POST", "/api/novo-rh/settings/profiles/:id/values").cells).toEqual(onlyAdmin);
    expect(row("GET", "/api/novo-rh/audit/events").cells).toEqual(onlyAdmin);
    expect(row("PUT", "/api/access-profiles/:id/field-privacy").cells).toEqual(onlyAdmin);
    // Estrutura: ver para os perfis de gestão; gerir só Admin; Colaborador nunca.
    expect(row("GET", "/api/novo-rh/structure/departments").cells).toEqual({ admin: "permitido", manager: "permitido", rh: "permitido", financeiro: "permitido", colaborador: "negado" });
    expect(row("POST", "/api/novo-rh/structure/departments").cells).toEqual(onlyAdmin);
    // Os meus avisos e a política de sessão: todos, incluindo o Colaborador.
    expect(Object.values(row("GET", "/api/me/notifications").cells).every((c) => c === "permitido")).toBe(true);
    expect(Object.values(row("GET", "/api/me/session-policy").cells).every((c) => c === "permitido")).toBe(true);
  });
});

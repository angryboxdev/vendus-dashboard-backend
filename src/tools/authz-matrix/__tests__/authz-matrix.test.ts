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

import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Document } from "../../domain/entities/document.js";
import { EmployeeDocumentsController } from "../../adapters/in/employee-documents.controller.js";
import { MyDocumentsController } from "../../adapters/in/my-documents.controller.js";
import { ListEmployeeDocumentsUseCase } from "../../application/use-cases/list-employee-documents.use-case.js";
import { UploadEmployeeDocumentUseCase } from "../../application/use-cases/upload-employee-document.use-case.js";
import { ReplaceEmployeeDocumentUseCase } from "../../application/use-cases/replace-employee-document.use-case.js";
import { RemoveEmployeeDocumentUseCase } from "../../application/use-cases/remove-employee-document.use-case.js";
import { GetEmployeeDocumentDownloadUrlUseCase } from "../../application/use-cases/get-employee-document-download-url.use-case.js";
import { GetEmployeeDocumentHistoryUseCase } from "../../application/use-cases/get-employee-document-history.use-case.js";
import { GetDocumentOverviewUseCase } from "../../application/use-cases/get-document-overview.use-case.js";
import { GetDocumentArchiveUseCase } from "../../application/use-cases/get-document-archive.use-case.js";
import { GetEmployeeDocumentSummaryUseCase } from "../../application/use-cases/get-employee-document-summary.use-case.js";
import { ReplaceMyDocumentUseCase, ReviewEmployeeDocumentUseCase } from "../../application/use-cases/employee-document-review.use-cases.js";
import { GetMyDocumentUrlUseCase, ListMyDocumentsUseCase } from "../../application/use-cases/my-documents.use-cases.js";
import { FakeDocumentRepository } from "../fakes/fake-document-repository.js";
import { FakeDocumentCategoryRepository } from "../fakes/fake-document-category-repository.js";
import { FakeEmployeeDirectory, employee } from "../fakes/fake-employee-directory.js";
import { FakeEmployeeFileStorage } from "../fakes/fake-employee-file-storage.js";
import { FakeDocumentAuditLog } from "../fakes/fake-document-audit-log.js";

// O RBAC real é o routeGuard (matriz); aqui só se testa a camada HTTP.
jest.mock("../../../../middleware/auth.js", () => ({
  requireMinRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
// Uploads não são testados aqui (o default import do multer não resolve no Jest em CommonJS).
jest.mock("multer", () => {
  const pass = () => (_req: unknown, _res: unknown, next: () => void) => next();
  const multer = Object.assign(() => ({ single: pass, array: pass }), { memoryStorage: () => ({}) });
  return { __esModule: true, default: multer };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

const ORG = mintOrganizationId("org-a");

/** ADR-0040, fase 1: as rotas do Novo RH e os aliases do RH antigo respondem igual; o Portal mantém `/me/documents`. */
describe("API documentos de colaborador (Novo RH + aliases /hr)", () => {
  let server: Server;
  let base: string;
  let userId: string;
  const ana = employee({ fullName: "Ana Teste" });

  beforeEach(async () => {
    const employees = new FakeEmployeeDirectory();
    employees.seed(ORG, ana);
    employees.links.set(ana.id, "u-ana");
    const documents = new FakeDocumentRepository();
    documents.seed(
      ORG,
      Document.createFirstVersion({
        owner: { type: "employee", id: ana.id },
        category: "nif",
        mandatory: true,
        fileName: "nif.pdf",
        storagePath: "x/nif.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 10,
        origin: "rh",
        expiresAt: null,
        period: null,
        uploadedBy: "rh@demo.invalid",
      }),
    );
    const categories = new FakeDocumentCategoryRepository();
    const files = new FakeEmployeeFileStorage();
    const audit = new FakeDocumentAuditLog();
    const download = new GetEmployeeDocumentDownloadUrlUseCase(documents, files);
    const controller = new EmployeeDocumentsController(
      new ListEmployeeDocumentsUseCase(documents),
      new UploadEmployeeDocumentUseCase(employees, documents, files, audit, categories),
      new ReplaceEmployeeDocumentUseCase(employees, documents, files, audit),
      new RemoveEmployeeDocumentUseCase(documents, audit),
      download,
      new GetEmployeeDocumentHistoryUseCase(documents),
      new GetDocumentOverviewUseCase(employees, documents, categories),
      new ReviewEmployeeDocumentUseCase(documents, audit),
      new GetEmployeeDocumentSummaryUseCase(employees, documents, categories),
      new GetDocumentArchiveUseCase(employees, documents, categories),
    );
    const me = new MyDocumentsController(
      new ListMyDocumentsUseCase(employees, documents, categories, () => "2026-10-20"),
      new GetMyDocumentUrlUseCase(employees, download),
      new ReplaceMyDocumentUseCase(employees, documents, categories, files, audit, () => "2026-10-20"),
    );
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = { sub: userId, email: "gestor@demo.invalid", orgId: ORG, orgRole: "manager" };
      next();
    });
    app.use("/api", me.router);
    app.use("/api", controller.router);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    userId = "u-gestor";
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const json = async (path: string, init?: RequestInit) => {
    const r = await fetch(`${base}${path}`, init);
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  };

  test("lista e visão geral: Novo RH e alias /hr devolvem o mesmo", async () => {
    const novo = await json(`/novo-rh/people/${ana.id}/documents`);
    expect(novo.status).toBe(200);
    expect(novo.body).toEqual([expect.objectContaining({ employeeId: ana.id, category: "nif", fileName: "nif.pdf" })]);
    expect(await json(`/hr/people/${ana.id}/documents`)).toEqual(novo);
    const overview = await json("/novo-rh/documents/overview");
    expect(overview.status).toBe(200);
    expect(await json("/hr/document-overview")).toEqual(overview);
  });

  test("resumo da ficha (só Novo RH): obrigatórios e alertas; colaborador inexistente → 404", async () => {
    const r = await json(`/novo-rh/people/${ana.id}/documents/summary`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ employeeId: ana.id, positionId: null });
    expect(r.body.mandatoryTotal).toBeGreaterThan(0);
    expect((await json("/novo-rh/people/nao-existe/documents/summary")).status).toBe(404);
  });

  test("download e remoção de um documento inexistente → 404", async () => {
    expect((await json(`/novo-rh/people/${ana.id}/documents/nao-existe/download-url`)).status).toBe(404);
    expect((await json(`/novo-rh/people/${ana.id}/documents/nao-existe`, { method: "DELETE" })).status).toBe(404);
  });

  test("Portal: conta sem ficha → 403 PORTAL_NOT_LINKED; com ficha vê os seus documentos", async () => {
    const unlinked = await json("/me/documents");
    expect(unlinked).toEqual({ status: 403, body: expect.objectContaining({ code: "PORTAL_NOT_LINKED" }) });
    userId = "u-ana";
    const mine = await json("/me/documents");
    expect(mine.status).toBe(200);
    expect(mine.body.map((d: { fileName: string }) => d.fileName)).toEqual(["nif.pdf"]);
  });
});

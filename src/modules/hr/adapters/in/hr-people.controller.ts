import { Router } from "express";
import multer from "multer";
import { requireMinRole } from "../../../../middleware/auth.js";
import type { AppRole } from "../../../../middleware/auth-middleware.js";
import {
  EmployeeNotFoundError,
  EmployeeDocumentNotFoundError,
  InvalidEmployeeError,
  DocumentCategoryAlreadyExistsError,
  DocumentNotCurrentError,
} from "../../domain/errors.js";
import type { ViewerRole } from "../../domain/services/sensitive-field-masking.service.js";
import type {
  ListEmployeesPort,
  GetPeopleKpisPort,
  GetEmployeeProfilePort,
  CreateEmployeePort,
  UpdateEmployeePort,
  SetEmployeeStatusPort,
  UploadEmployeePhotoPort,
  GetEmployeeHistoryPort,
  CreateEmployeeCommand,
} from "../../domain/ports/in/employee.ports.js";
import type {
  ListEmployeeDocumentsPort,
  UploadEmployeeDocumentPort,
  ReplaceEmployeeDocumentPort,
  RemoveEmployeeDocumentPort,
  GetEmployeeDocumentDownloadUrlPort,
  GetEmployeeDocumentHistoryPort,
} from "../../domain/ports/in/employee-document.ports.js";

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype));
  },
});

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    cb(null, ["application/pdf", "image/jpeg", "image/png"].includes(file.mimetype));
  },
});

/** `req.auth.orgRole` (AppRole) e `ViewerRole` deste módulo têm exatamente os mesmos valores — só o domínio não pode importar o tipo do middleware (D10). */
function toViewerRole(role: AppRole): ViewerRole {
  return role;
}

const EMPLOYMENT_TYPES = new Set(["permanent", "contract", "extra"]);
const JOB_ROLES = new Set(["manager", "prep", "service"]);
const SALARY_TYPES = new Set(["fixed", "hourly"]);

type EmployeeOptionalFields = Partial<Omit<CreateEmployeeCommand, "organizationId" | "actor" | "fullName">>;

/** Lê os campos opcionais partilhados por criar/editar colaborador — só inclui uma chave quando o body a trouxe, para o PATCH não sobrescrever campos não enviados. */
function readEmployeeFields(body: Record<string, unknown>): EmployeeOptionalFields {
  const out: Record<string, unknown> = {};
  if ("email" in body) out.email = body.email === "" ? null : (body.email as string | null);
  if ("phone" in body) out.phone = body.phone === "" ? null : (body.phone as string | null);
  if ("roleOrNotes" in body) out.roleOrNotes = (body.roleOrNotes as string | null) ?? null;
  if (typeof body.employmentType === "string" && EMPLOYMENT_TYPES.has(body.employmentType)) {
    out.employmentType = body.employmentType;
  }
  if (typeof body.jobRole === "string" && JOB_ROLES.has(body.jobRole)) out.jobRole = body.jobRole;
  if ("hiredAt" in body) out.hiredAt = (body.hiredAt as string | null) ?? null;
  if ("baseSalary" in body) out.baseSalary = body.baseSalary != null ? Number(body.baseSalary) : null;
  if (typeof body.salaryType === "string" && SALARY_TYPES.has(body.salaryType)) out.salaryType = body.salaryType;
  if ("hourlyRate" in body) out.hourlyRate = body.hourlyRate != null ? Number(body.hourlyRate) : null;
  if ("nif" in body) out.nif = (body.nif as string | null) ?? null;
  if ("iban" in body) out.iban = (body.iban as string | null) ?? null;
  if ("address" in body) out.address = (body.address as string | null) ?? null;
  if ("birthDate" in body) out.birthDate = (body.birthDate as string | null) ?? null;
  if ("socialSecurityNumber" in body) out.socialSecurityNumber = (body.socialSecurityNumber as string | null) ?? null;
  if ("idCardNumber" in body) out.idCardNumber = (body.idCardNumber as string | null) ?? null;
  if ("nationality" in body) out.nationality = (body.nationality as string | null) ?? null;
  if ("emergencyContactName" in body) out.emergencyContactName = (body.emergencyContactName as string | null) ?? null;
  if ("emergencyContactPhone" in body)
    out.emergencyContactPhone = (body.emergencyContactPhone as string | null) ?? null;
  return out as EmployeeOptionalFields;
}

export class HrPeopleController {
  readonly router: Router;

  constructor(
    private readonly listEmployees: ListEmployeesPort,
    private readonly getPeopleKpis: GetPeopleKpisPort,
    private readonly getEmployeeProfile: GetEmployeeProfilePort,
    private readonly createEmployee: CreateEmployeePort,
    private readonly updateEmployee: UpdateEmployeePort,
    private readonly setEmployeeStatus: SetEmployeeStatusPort,
    private readonly uploadEmployeePhoto: UploadEmployeePhotoPort,
    private readonly getEmployeeHistory: GetEmployeeHistoryPort,
    private readonly listEmployeeDocuments: ListEmployeeDocumentsPort,
    private readonly uploadEmployeeDocument: UploadEmployeeDocumentPort,
    private readonly replaceEmployeeDocument: ReplaceEmployeeDocumentPort,
    private readonly removeEmployeeDocument: RemoveEmployeeDocumentPort,
    private readonly getEmployeeDocumentDownloadUrl: GetEmployeeDocumentDownloadUrlPort,
    private readonly getEmployeeDocumentHistory: GetEmployeeDocumentHistoryPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /** GET /api/hr/people — lista paginada (qualquer role autenticado, incl. hr_viewer, tal como o resto do RH). */
    this.router.get("/hr/people", async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        const result = await this.listEmployees.execute({
          organizationId: req.auth!.orgId,
          viewerRole: toViewerRole(req.auth!.orgRole),
          ...(q.search && { search: q.search }),
          ...(q.status === "active" || q.status === "inactive" || q.status === "all" ? { status: q.status } : {}),
          ...(q.employmentType === "permanent" || q.employmentType === "contract" || q.employmentType === "extra"
            ? { employmentType: q.employmentType }
            : {}),
          ...(q.documentSituation === "ok" || q.documentSituation === "expiring" || q.documentSituation === "missing"
            ? { documentSituation: q.documentSituation }
            : {}),
          ...(q.profileComplete === "complete" || q.profileComplete === "incomplete"
            ? { profileComplete: q.profileComplete }
            : {}),
          page: q.page ? Math.max(1, Number(q.page)) : 1,
          pageSize: q.pageSize ? Math.min(100, Math.max(1, Number(q.pageSize))) : 10,
        });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** GET /api/hr/people/kpis — cards + pendências prioritárias. */
    this.router.get("/hr/people/kpis", async (req, res) => {
      try {
        const result = await this.getPeopleKpis.execute(req.auth!.orgId);
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** GET /api/hr/people/:id — perfil 360º. */
    this.router.get("/hr/people/:id", async (req, res) => {
      try {
        const result = await this.getEmployeeProfile.execute({
          organizationId: req.auth!.orgId,
          viewerRole: toViewerRole(req.auth!.orgRole),
          id: req.params["id"] as string,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof EmployeeNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** GET /api/hr/people/:id/history — histórico agregado de auditoria. */
    this.router.get("/hr/people/:id/history", async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        const result = await this.getEmployeeHistory.execute({
          organizationId: req.auth!.orgId,
          id: req.params["id"] as string,
          page: q.page ? Math.max(1, Number(q.page)) : 1,
          pageSize: q.pageSize ? Math.min(100, Math.max(1, Number(q.pageSize))) : 20,
        });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** POST /api/hr/people — criar. */
    this.router.post("/hr/people", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.fullName !== "string" || body.fullName.trim().length === 0) {
          res.status(400).json({ error: "fullName é obrigatório" });
          return;
        }
        const result = await this.createEmployee.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          fullName: body.fullName,
          ...readEmployeeFields(body),
        });
        res.status(201).json(result);
      } catch (e) {
        if (e instanceof InvalidEmployeeError) {
          res.status(400).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** PATCH /api/hr/people/:id — editar dados pessoais/contratuais. */
    this.router.patch("/hr/people/:id", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const data: Record<string, unknown> = { ...readEmployeeFields(body) };
        if (body.fullName !== undefined) data.fullName = body.fullName;
        const result = await this.updateEmployee.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          id: req.params["id"] as string,
          data,
        } as Parameters<typeof this.updateEmployee.execute>[0]);
        res.json(result);
      } catch (e) {
        if (e instanceof EmployeeNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        if (e instanceof InvalidEmployeeError) {
          res.status(400).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** PATCH /api/hr/people/:id/status — ativar/desativar. */
    this.router.patch("/hr/people/:id/status", requireMinRole("manager"), async (req, res) => {
      try {
        const body = req.body as { status?: unknown };
        if (body.status !== "active" && body.status !== "inactive") {
          res.status(400).json({ error: "status deve ser 'active' ou 'inactive'" });
          return;
        }
        const result = await this.setEmployeeStatus.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          id: req.params["id"] as string,
          status: body.status,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof EmployeeNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** POST /api/hr/people/:id/photo (multipart "file") — upload/substituir foto. */
    this.router.post("/hr/people/:id/photo", requireMinRole("manager"), photoUpload.single("file"), async (req, res) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: "ficheiro em falta (campo 'file'), formatos aceites: jpg, png, webp" });
          return;
        }
        const result = await this.uploadEmployeePhoto.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          id: req.params["id"] as string,
          buffer: req.file.buffer,
          filename: req.file.originalname,
          mimeType: req.file.mimetype,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof EmployeeNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** GET /api/hr/people/:id/documents — versões atuais. */
    this.router.get("/hr/people/:id/documents", async (req, res) => {
      try {
        const result = await this.listEmployeeDocuments.execute({
          organizationId: req.auth!.orgId,
          employeeId: req.params["id"] as string,
        });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** POST /api/hr/people/:id/documents (multipart "file") — nova categoria. */
    this.router.post("/hr/people/:id/documents", requireMinRole("manager"), documentUpload.single("file"), async (req, res) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: "ficheiro em falta (campo 'file'), formatos aceites: pdf, jpg, png" });
          return;
        }
        const body = req.body as Record<string, string | undefined>;
        if (!body.category) {
          res.status(400).json({ error: "category é obrigatório" });
          return;
        }
        const origin = body.origin === "colaborador" || body.origin === "sistema" ? body.origin : "rh";
        const result = await this.uploadEmployeeDocument.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          employeeId: req.params["id"] as string,
          category: body.category,
          mandatory: body.mandatory === "true",
          origin,
          expiresAt: body.expiresAt || null,
          buffer: req.file.buffer,
          filename: req.file.originalname,
          mimeType: req.file.mimetype,
        });
        res.status(201).json(result);
      } catch (e) {
        if (e instanceof EmployeeNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        if (e instanceof DocumentCategoryAlreadyExistsError) {
          res.status(409).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** POST /api/hr/people/:id/documents/:docId/replace (multipart "file") — nova versão. */
    this.router.post(
      "/hr/people/:id/documents/:docId/replace",
      requireMinRole("manager"),
      documentUpload.single("file"),
      async (req, res) => {
        try {
          if (!req.file) {
            res.status(400).json({ error: "ficheiro em falta (campo 'file'), formatos aceites: pdf, jpg, png" });
            return;
          }
          const body = req.body as Record<string, string | undefined>;
          const result = await this.replaceEmployeeDocument.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            employeeId: req.params["id"] as string,
            documentId: req.params["docId"] as string,
            ...(body.expiresAt !== undefined && { expiresAt: body.expiresAt || null }),
            buffer: req.file.buffer,
            filename: req.file.originalname,
            mimeType: req.file.mimetype,
          });
          res.json(result);
        } catch (e) {
          if (e instanceof EmployeeNotFoundError || e instanceof EmployeeDocumentNotFoundError) {
            res.status(404).json({ error: e.message });
            return;
          }
          if (e instanceof DocumentNotCurrentError) {
            res.status(409).json({ error: e.message });
            return;
          }
          res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
        }
      },
    );

    /** DELETE /api/hr/people/:id/documents/:docId — remoção lógica. */
    this.router.delete("/hr/people/:id/documents/:docId", requireMinRole("manager"), async (req, res) => {
      try {
        await this.removeEmployeeDocument.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email,
          employeeId: req.params["id"] as string,
          documentId: req.params["docId"] as string,
        });
        res.status(204).send();
      } catch (e) {
        if (e instanceof EmployeeDocumentNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        if (e instanceof DocumentNotCurrentError) {
          res.status(409).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** GET /api/hr/people/:id/documents/:docId/download-url — URL assinado (120s). */
    this.router.get("/hr/people/:id/documents/:docId/download-url", async (req, res) => {
      try {
        const result = await this.getEmployeeDocumentDownloadUrl.execute({
          organizationId: req.auth!.orgId,
          employeeId: req.params["id"] as string,
          documentId: req.params["docId"] as string,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof EmployeeDocumentNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** GET /api/hr/people/:id/documents/:docId/history — cadeia de versões da categoria. */
    this.router.get("/hr/people/:id/documents/:docId/history", async (req, res) => {
      try {
        const result = await this.getEmployeeDocumentHistory.execute({
          organizationId: req.auth!.orgId,
          employeeId: req.params["id"] as string,
          documentId: req.params["docId"] as string,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof EmployeeDocumentNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });
  }
}

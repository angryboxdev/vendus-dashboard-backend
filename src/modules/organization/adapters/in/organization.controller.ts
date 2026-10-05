import { Router, type Response } from "express";
import multer from "multer";
import { requireMinRole } from "../../../../middleware/auth.js";
import type {
  GetOrganizationProfilePort,
  ListOrganizationHistoryPort,
  UpdateOrganizationProfilePort,
  UploadOrganizationLogoPort,
} from "../../domain/ports/in/organization-profile.ports.js";
import type { OrganizationProfileChanges } from "../../domain/entities/organization-profile.js";
import { InvalidOrganizationProfileError, OrganizationNotFoundError } from "../../domain/errors.js";

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    cb(null, ["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(file.mimetype));
  },
});

const STRING_FIELDS = ["name", "legalName", "nif", "country", "timezone"] as const;
const NULLABLE_STRING_FIELDS = ["niss", "address", "postalCode", "city", "email", "phone", "website"] as const;

/** Só copia campos conhecidos com o tipo certo — `status`/`id`/logotipo nunca são aceites pelo PATCH. */
function parseChanges(body: Record<string, unknown>): OrganizationProfileChanges | string {
  const changes: Record<string, string | null> = {};
  for (const field of STRING_FIELDS) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== "string") return `${field} deve ser texto`;
    changes[field] = body[field] as string;
  }
  for (const field of NULLABLE_STRING_FIELDS) {
    if (body[field] === undefined) continue;
    if (body[field] !== null && typeof body[field] !== "string") return `${field} deve ser texto ou null`;
    changes[field] = body[field] as string | null;
  }
  return changes as OrganizationProfileChanges;
}

function handleError(e: unknown, res: Response): void {
  if (e instanceof InvalidOrganizationProfileError) {
    res.status(400).json({ error: e.message, fieldErrors: e.fieldErrors });
    return;
  }
  if (e instanceof OrganizationNotFoundError) {
    res.status(404).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
}

/**
 * Montado depois do `requireAuth` global (`server.ts`). Ler o perfil é
 * permitido a qualquer role autenticado (dados públicos da entidade legal);
 * editar e trocar o logotipo exigem `admin`, como a restante configuração
 * da organização.
 */
export class OrganizationController {
  readonly router: Router;

  constructor(
    private readonly getOrganizationProfile: GetOrganizationProfilePort,
    private readonly updateOrganizationProfile: UpdateOrganizationProfilePort,
    private readonly uploadOrganizationLogo: UploadOrganizationLogoPort,
    private readonly listOrganizationHistory: ListOrganizationHistoryPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /** GET /organization — perfil da organização do chamador. */
    this.router.get("/organization", async (req, res) => {
      try {
        res.json(await this.getOrganizationProfile.execute({ organizationId: req.auth!.orgId }));
      } catch (e) {
        handleError(e, res);
      }
    });

    /** PATCH /organization — alteração parcial; 400 com `fieldErrors` por campo. */
    this.router.patch("/organization", requireMinRole("admin"), async (req, res) => {
      try {
        const changes = parseChanges((req.body ?? {}) as Record<string, unknown>);
        if (typeof changes === "string") {
          res.status(400).json({ error: changes });
          return;
        }
        res.json(
          await this.updateOrganizationProfile.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            changes,
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });

    /** POST /organization/logo (multipart "file") — jpg, png, webp ou svg até 2 MB. */
    this.router.post("/organization/logo", requireMinRole("admin"), logoUpload.single("file"), async (req, res) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: "ficheiro em falta (campo 'file'), formatos aceites: jpg, png, webp, svg" });
          return;
        }
        res.json(
          await this.uploadOrganizationLogo.execute({
            organizationId: req.auth!.orgId,
            actor: req.auth!.email,
            buffer: req.file.buffer,
            filename: req.file.originalname,
            mimeType: req.file.mimetype,
          }),
        );
      } catch (e) {
        handleError(e, res);
      }
    });

    /** GET /organization/history — histórico de alterações da Empresa. */
    this.router.get("/organization/history", requireMinRole("admin"), async (req, res) => {
      try {
        res.json(await this.listOrganizationHistory.execute({ organizationId: req.auth!.orgId }));
      } catch (e) {
        handleError(e, res);
      }
    });
  }
}

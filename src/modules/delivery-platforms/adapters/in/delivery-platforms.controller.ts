import { Router, type Response } from "express";
import multer from "multer";
import type { ImportPlatformDocumentsPort } from "../../domain/ports/in/import-platform-documents.port.js";
import type { ListPlatformStatementsPort } from "../../domain/ports/in/list-platform-statements.port.js";
import type { ExportPlatformMarginReportPort, GetPlatformMarginReportPort } from "../../domain/ports/in/platform-margin-report.port.js";
import { InvalidStatementPeriodError } from "../../domain/errors.js";

const MAX_FILES = 20;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: MAX_FILES } });

export class DeliveryPlatformsController {
  readonly router: Router;

  constructor(
    private readonly importDocuments: ImportPlatformDocumentsPort,
    private readonly listStatements: ListPlatformStatementsPort,
    private readonly getReport: GetPlatformMarginReportPort,
    private readonly exportReport: ExportPlatformMarginReportPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /**
     * POST /delivery-platforms/import   (multipart/form-data, campo "files", até 20)
     * Extratos das plataformas (PDF da Uber, da Glovo…). Cada ficheiro é tratado à parte: devolve os
     * importados e os rejeitados com o motivo. 400 sem ficheiros.
     */
    this.router.post("/delivery-platforms/import", upload.array("files", MAX_FILES), async (req, res) => {
      try {
        const files = (req.files as Express.Multer.File[] | undefined) ?? [];
        if (files.length === 0) {
          res.status(400).json({ error: "Envie pelo menos um ficheiro" });
          return;
        }
        res.json(
          await this.importDocuments.execute({
            organizationId: req.auth!.orgId,
            importedBy: req.auth!.email ?? null,
            files: files.map((f) => ({ name: f.originalname, content: new Uint8Array(f.buffer) })),
          }),
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Internal error";
        console.error("[DeliveryPlatforms] POST /delivery-platforms/import falhou:", msg);
        res.status(500).json({ error: msg });
      }
    });

    /**
     * GET /delivery-platforms/report?year=&month=
     * Margem por plataforma do mês (documentos que atravessam o mês repartidos pelo SAF-T diário).
     */
    this.router.get("/delivery-platforms/report", async (req, res) => {
      try {
        res.json(await this.getReport.execute({ organizationId: req.auth!.orgId, year: Number(req.query["year"]), month: Number(req.query["month"]) }));
      } catch (e: unknown) {
        this.fail(res, e);
      }
    });

    /** GET /delivery-platforms/report/export?year=&month=&format=xlsx|pdf — o mesmo relatório para descarregar. */
    this.router.get("/delivery-platforms/report/export", async (req, res) => {
      const format = req.query["format"];
      if (format !== "xlsx" && format !== "pdf") {
        res.status(400).json({ error: "format tem de ser xlsx ou pdf" });
        return;
      }
      try {
        const file = await this.exportReport.execute({
          organizationId: req.auth!.orgId,
          year: Number(req.query["year"]),
          month: Number(req.query["month"]),
          format,
        });
        res.setHeader("Content-Type", file.contentType);
        res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
        res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
        res.send(Buffer.from(file.content));
      } catch (e: unknown) {
        this.fail(res, e);
      }
    });

    /**
     * GET /delivery-platforms/statements?year=&month=
     * Extratos importados cujo período toca o mês, com os totais por natureza (com IVA).
     */
    this.router.get("/delivery-platforms/statements", async (req, res) => {
      try {
        res.json(
          await this.listStatements.execute({
            organizationId: req.auth!.orgId,
            year: Number(req.query["year"]),
            month: Number(req.query["month"]),
          }),
        );
      } catch (e: unknown) {
        if (e instanceof InvalidStatementPeriodError) {
          res.status(400).json({ error: e.message });
          return;
        }
        const msg = e instanceof Error ? e.message : "Internal error";
        res.status(500).json({ error: msg });
      }
    });
  }

  private fail(res: Response, e: unknown): void {
    if (e instanceof InvalidStatementPeriodError) {
      res.status(400).json({ error: e.message });
      return;
    }
    const msg = e instanceof Error ? e.message : "Internal error";
    console.error("[DeliveryPlatforms] relatório falhou:", msg);
    res.status(500).json({ error: msg });
  }
}

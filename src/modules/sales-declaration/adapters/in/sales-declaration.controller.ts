import { Router } from "express";
import multer from "multer";
import type { GenerateSalesDeclarationPort } from "../../domain/ports/in/generate-sales-declaration.port.js";
import { InvalidSaftFileError, InvalidSalesDeclarationRequestError } from "../../domain/errors.js";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_FILES = 10;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: MAX_FILES } });

export class SalesDeclarationController {
  readonly router: Router;

  constructor(private readonly generateSalesDeclaration: GenerateSalesDeclarationPort) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /**
     * POST /sales-declaration/export   (multipart/form-data, campo "files")
     * Recebe um ou mais SAF-T (Vendus, AirMenu…) e devolve o .xlsx no formato
     * SalesReport do centro comercial, com o líquido (sem IVA) de cada dia.
     * 400 se não houver ficheiros ou se algum não for um SAF-T de vendas.
     */
    this.router.post("/sales-declaration/export", upload.array("files", MAX_FILES), async (req, res) => {
      try {
        const files = (req.files as Express.Multer.File[] | undefined) ?? [];
        const file = await this.generateSalesDeclaration.execute({
          // SAF-T declaram UTF-8 ou Windows-1252; só interessam tags e números (ASCII), que latin1 preserva.
          saftFiles: files.map((f) => ({ name: f.originalname, content: f.buffer.toString("latin1") })),
        });
        res.setHeader("Content-Type", XLSX_MIME);
        res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
        res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
        res.send(file.content);
      } catch (e: unknown) {
        if (e instanceof InvalidSaftFileError || e instanceof InvalidSalesDeclarationRequestError) {
          res.status(400).json({ error: e.message });
          return;
        }
        const msg = e instanceof Error ? e.message : "Internal error";
        console.error("[SalesDeclaration] POST /sales-declaration/export falhou:", msg);
        res.status(500).json({ error: msg });
      }
    });
  }
}

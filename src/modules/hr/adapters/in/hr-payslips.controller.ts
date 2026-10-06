import { Router, type Response } from "express";
import multer from "multer";
import { InvalidDocumentError } from "../../domain/errors.js";
import { isPayslipCategory } from "../../domain/ports/in/payslip-import.ports.js";
import type {
  ImportPayslipsPort,
  PayslipFile,
  PayslipImportItem,
  PreviewPayslipImportPort,
} from "../../domain/ports/in/payslip-import.ports.js";

const MAX_FILES = 100;

const payslipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_FILES }, // 10 MB por recibo
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === "application/pdf");
  },
});

/** O multer entrega o nome do ficheiro em latin1; recupera os acentos quando era UTF-8. */
function decodeFileName(name: string): string {
  if (!/[\u0080-ÿ]/.test(name)) return name;
  const utf8 = Buffer.from(name, "latin1").toString("utf8");
  return utf8.includes("�") ? name : utf8;
}

function readFiles(files: unknown): PayslipFile[] {
  return ((files ?? []) as Express.Multer.File[]).map((f) => ({
    fileName: decodeFileName(f.originalname),
    buffer: f.buffer,
    mimeType: f.mimetype,
  }));
}

/** `mapping` (JSON) — `[{ fileName, employeeId, action: "create" | "replace" }]`; ficheiros sem entrada são ignorados ("Cancelar"). */
type MappingEntry = Pick<PayslipImportItem, "fileName" | "employeeId" | "action">;

function readMapping(raw: unknown): MappingEntry[] | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out: MappingEntry[] = [];
    for (const m of parsed as Record<string, unknown>[]) {
      if (typeof m.fileName !== "string" || typeof m.employeeId !== "string" || (m.action !== "create" && m.action !== "replace")) return null;
      out.push({ fileName: m.fileName, employeeId: m.employeeId, action: m.action });
    }
    return out;
  } catch {
    return null;
  }
}

/** "category" — recibo_vencimento (omissão) ou recibo_verde; `null` se inválida. */
function readCategory(raw: unknown) {
  if (raw === undefined || raw === "") return "recibo_vencimento" as const;
  return isPayslipCategory(raw) ? raw : null;
}

function handleError(e: unknown, res: Response): void {
  if (e instanceof InvalidDocumentError) {
    res.status(400).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
}

/**
 * Colaboradores → Documentos → "Importar recibos" (Base Organizacional,
 * ticket 10). Só `admin`: os recibos têm dados salariais. Dois passos —
 * pré-visualizar (não grava) e importar o que o utilizador confirmou; os
 * PDFs são reenviados no 2.º passo (nada fica guardado entre os dois).
 */
export class HrPayslipsController {
  readonly router: Router;

  constructor(
    private readonly previewPayslipImport: PreviewPayslipImportPort,
    private readonly importPayslips: ImportPayslipsPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /** POST /api/hr/payslips/import/preview (multipart "files" + "period" YYYY-MM + "category" opcional). */
    this.router.post("/hr/payslips/import/preview", payslipUpload.array("files", MAX_FILES), async (req, res) => {
      try {
        const files = readFiles(req.files);
        const body = (req.body ?? {}) as Record<string, unknown>;
        const period = body.period;
        const category = readCategory(body.category);
        if (files.length === 0 || typeof period !== "string" || !category) {
          res.status(400).json({ error: "category (recibo_vencimento|recibo_verde), period e pelo menos um PDF (campo 'files') são obrigatórios" });
          return;
        }
        res.json(await this.previewPayslipImport.execute({ organizationId: req.auth!.orgId, category, period, files }));
      } catch (e) {
        handleError(e, res);
      }
    });

    /** POST /api/hr/payslips/import (multipart "files" + "period" + "mapping" JSON). */
    this.router.post("/hr/payslips/import", payslipUpload.array("files", MAX_FILES), async (req, res) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const mapping = readMapping(body.mapping);
        const category = readCategory(body.category);
        if (typeof body.period !== "string" || !mapping || mapping.length === 0 || !category) {
          res.status(400).json({ error: "category (recibo_vencimento|recibo_verde), period, mapping e pelo menos um recibo são obrigatórios" });
          return;
        }
        const byName = new Map(readFiles(req.files).map((f) => [f.fileName, f]));
        const items: PayslipImportItem[] = [];
        for (const m of mapping) {
          const file = byName.get(m.fileName);
          if (!file) {
            res.status(400).json({ error: `Ficheiro em falta no envio: ${m.fileName}` });
            return;
          }
          items.push({ ...file, employeeId: m.employeeId, action: m.action });
        }
        res.json(await this.importPayslips.execute({ organizationId: req.auth!.orgId, category, actor: req.auth!.email, period: body.period, items }));
      } catch (e) {
        handleError(e, res);
      }
    });
  }
}

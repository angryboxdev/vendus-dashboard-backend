import { Router } from "express";
import multer from "multer";
import {
  confirmSupplierInvoiceImport,
  createSupplierInvoiceImport,
  getSupplierInvoiceImport,
} from "../services/supplierInvoiceImportService.js";
import type { ConfirmSupplierInvoiceImportBody } from "../domain/supplierInvoiceImportTypes.js";

export const supplierInvoiceImportRoutes = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

/**
 * POST /api/stock/invoice-imports
 * multipart: field "file" (PDF com texto, JPG, PNG, WebP)
 */
supplierInvoiceImportRoutes.post(
  "/stock/invoice-imports",
  upload.single("file"),
  async (req, res) => {
    try {
      const file = req.file;
      if (!file?.buffer) {
        res.status(400).json({ error: "Ficheiro em falta (field: file)" });
        return;
      }
      const mime = file.mimetype || "application/octet-stream";
      const result = await createSupplierInvoiceImport({
        buffer: file.buffer,
        fileName: file.originalname || "invoice",
        mime,
      });
      res.status(201).json(result);
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Erro ao importar fatura";
      res.status(500).json({ error: message });
    }
  }
);

supplierInvoiceImportRoutes.get(
  "/stock/invoice-imports/:id",
  async (req, res) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: "id obrigatório" });
        return;
      }
      const result = await getSupplierInvoiceImport(id);
      res.json(result);
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Erro ao obter importação";
      const status = /não encontrad/i.test(message) ? 404 : 500;
      res.status(status).json({ error: message });
    }
  }
);

supplierInvoiceImportRoutes.post(
  "/stock/invoice-imports/:id/confirm",
  async (req, res) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: "id obrigatório" });
        return;
      }
      const body = req.body as ConfirmSupplierInvoiceImportBody;
      const result = await confirmSupplierInvoiceImport(id, body ?? {});
      res.json(result);
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Erro ao confirmar importação";
      const isDup = message.startsWith("DUPLICATE:");
      const isState = /não está pronta|estado/i.test(message);
      const status = isDup ? 409 : isState ? 400 : 500;
      res.status(status).json({ error: message });
    }
  }
);

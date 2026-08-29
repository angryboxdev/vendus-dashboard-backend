import { Router } from "express";
import multer from "multer";
import {
  confirmSupplierInvoiceImport,
  createSupplierInvoiceImport,
  getSupplierInvoiceImport,
  updateSupplierInvoiceImport,
} from "../services/supplierInvoiceImportService.js";
import type {
  ConfirmSupplierInvoiceImportBody,
  UpdateSupplierInvoiceImportBody,
} from "../domain/supplierInvoiceImportTypes.js";

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
      const result = await createSupplierInvoiceImport(req.auth!.orgId, {
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
      const result = await getSupplierInvoiceImport(req.auth!.orgId, id);
      res.json(result);
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Erro ao obter importação";
      const status = /não encontrad/i.test(message) ? 404 : 500;
      res.status(status).json({ error: message });
    }
  }
);

/**
 * PATCH /api/stock/invoice-imports/:id
 * Edita campos de cabeçalho da fatura (fornecedor, número, data, totais).
 * Só permitido em status ready_for_review.
 */
supplierInvoiceImportRoutes.patch(
  "/stock/invoice-imports/:id",
  async (req, res) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: "id obrigatório" });
        return;
      }
      const body = req.body as UpdateSupplierInvoiceImportBody;
      const result = await updateSupplierInvoiceImport(req.auth!.orgId, id, body ?? {});
      res.json(result);
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Erro ao atualizar importação";
      const isState = /não pode ser editada|estado/i.test(message);
      res.status(isState ? 400 : 500).json({ error: message });
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
      const body = (req.body ?? {}) as ConfirmSupplierInvoiceImportBody;
      const result = await confirmSupplierInvoiceImport(req.auth!.orgId, id, body);
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

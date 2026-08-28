import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { UNATTENDED_SCOPE } from "../infra/scoped-db/unattended-scope.js";
import {
  verifyPin,
  submitClosing,
  listClosings,
  getClosing,
  patchClosing,
  getVendusTotal,
  type CashClosingStatus,
  type ListClosingsParams,
  type PatchClosingBody,
} from "../services/cashClosingService.js";

export const cashClosingPublicRoutes = Router();
export const cashClosingRoutes = Router();

function jsonError(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

// ---------- Public endpoints (no auth) ----------
// No authenticated user (D14): organization/location come from the
// unattended scope, never from the request.

/** POST /api/cash-closings/verify-pin */
cashClosingPublicRoutes.post("/cash-closings/verify-pin", async (req: Request, res: Response) => {
  try {
    const { pin } = req.body as { pin?: string };
    if (!pin || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
      jsonError(res, 400, "PIN inválido (4 dígitos)");
      return;
    }
    const result = await verifyPin(UNATTENDED_SCOPE.organizationId, pin);
    res.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro interno";
    const status = message.includes("inválido") || message.includes("inativo") ? 401 : 500;
    res.status(status).json({ error: message });
  }
});

/** POST /api/cash-closings/submit */
cashClosingPublicRoutes.post("/cash-closings/submit", async (req: Request, res: Response) => {
  try {
    const b = req.body as Record<string, unknown>;
    const { employeeId, closingDate, tpa, uber, glovo, bolt, eatz, cashSales, cashIn, cashOut, cashDrawerOpen, cashDrawerTotal, notes } = b;

    if (!employeeId || typeof employeeId !== "string") {
      jsonError(res, 400, "employeeId obrigatório"); return;
    }
    if (!closingDate || typeof closingDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(closingDate)) {
      jsonError(res, 400, "closingDate inválido (YYYY-MM-DD)"); return;
    }
    const toNum = (v: unknown, name: string): number => {
      const n = Number(v);
      if (isNaN(n) || n < 0) throw new Error(`${name} inválido`);
      return Math.round(n * 100) / 100;
    };

    const closing = await submitClosing(UNATTENDED_SCOPE.organizationId, UNATTENDED_SCOPE.locationId, {
      employeeId,
      closingDate,
      tpa: toNum(tpa, "tpa"),
      uber: toNum(uber, "uber"),
      glovo: toNum(glovo, "glovo"),
      bolt: toNum(bolt, "bolt"),
      eatz: toNum(eatz, "eatz"),
      cashSales: toNum(cashSales, "cashSales"),
      cashIn: toNum(cashIn, "cashIn"),
      cashOut: toNum(cashOut, "cashOut"),
      cashDrawerOpen: toNum(cashDrawerOpen, "cashDrawerOpen"),
      cashDrawerTotal: toNum(cashDrawerTotal, "cashDrawerTotal"),
      notes: typeof notes === "string" ? notes.trim() || null : null,
    });
    res.status(201).json(closing);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro interno";
    const status =
      message.includes("não encontrado") ? 404 :
      message.includes("Já existe") ? 409 :
      message.includes("inválido") ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

/** GET /api/cash-closings/vendus-total?date=YYYY-MM-DD */
cashClosingPublicRoutes.get("/cash-closings/vendus-total", async (req: Request, res: Response) => {
  try {
    const date = req.query.date as string | undefined;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      jsonError(res, 400, "date obrigatório (YYYY-MM-DD)"); return;
    }
    const total = await getVendusTotal(date);
    res.json({ total });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro interno";
    res.status(500).json({ error: message });
  }
});

// ---------- Authenticated manager endpoints ----------

/** GET /api/cash-closings */
cashClosingRoutes.get(
  "/cash-closings",
  requireAuth,
  requireMinRole("manager"),
  async (req: Request, res: Response) => {
    try {
      const { date, status, employeeId, limit, offset } = req.query as Record<string, string | undefined>;
      const listParams: ListClosingsParams = {
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0,
      };
      if (date) listParams.date = date;
      if (status) listParams.status = status as CashClosingStatus;
      if (employeeId) listParams.employeeId = employeeId;
      const result = await listClosings(req.auth!.orgId, listParams);
      res.json(result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erro interno";
      res.status(500).json({ error: message });
    }
  },
);

/** GET /api/cash-closings/:id */
cashClosingRoutes.get(
  "/cash-closings/:id",
  requireAuth,
  requireMinRole("manager"),
  async (req: Request, res: Response) => {
    try {
      const closing = await getClosing(req.auth!.orgId, req.params.id as string);
      res.json(closing);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erro interno";
      const status = message.includes("no rows") ? 404 : 500;
      res.status(status).json({ error: message });
    }
  },
);

/** PATCH /api/cash-closings/:id */
cashClosingRoutes.patch(
  "/cash-closings/:id",
  requireAuth,
  requireMinRole("manager"),
  async (req: Request, res: Response) => {
    try {
      const b = req.body as Record<string, unknown>;
      const patch: PatchClosingBody = {};
      if (b.status != null) patch.status = b.status as CashClosingStatus;
      if ("managerNotes" in b) patch.managerNotes = b.managerNotes as string | null;
      if ("notes" in b) patch.notes = b.notes as string | null;
      if (b.tpa != null) patch.tpa = Number(b.tpa);
      if (b.uber != null) patch.uber = Number(b.uber);
      if (b.glovo != null) patch.glovo = Number(b.glovo);
      if (b.bolt != null) patch.bolt = Number(b.bolt);
      if (b.eatz != null) patch.eatz = Number(b.eatz);
      if (b.cashSales != null) patch.cashSales = Number(b.cashSales);
      if (b.cashIn != null) patch.cashIn = Number(b.cashIn);
      if (b.cashOut != null) patch.cashOut = Number(b.cashOut);
      if (b.cashDrawerOpen != null) patch.cashDrawerOpen = Number(b.cashDrawerOpen);
      if (b.cashDrawerTotal != null) patch.cashDrawerTotal = Number(b.cashDrawerTotal);
      const updated = await patchClosing(req.auth!.orgId, req.params.id as string, patch);
      res.json(updated);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erro interno";
      const status = message.includes("no rows") ? 404 : 500;
      res.status(status).json({ error: message });
    }
  },
);

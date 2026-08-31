import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { listAuditLogs, type AuditEntityType, type AuditAction } from "../services/hrAuditService.js";
import { requireMinRole } from "../middleware/auth.js";

export const hrAuditRoutes = Router();

const querySchema = z.object({
  employeeId: z.string().uuid().optional(),
  entityType: z.enum(["employee", "shift", "payment", "attendance"]).optional(),
  action: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

hrAuditRoutes.get("/audit-logs", requireMinRole("manager"), async (req: Request, res: Response) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join("; ") });
      return;
    }
    const { employeeId, entityType, action, limit, offset } = parsed.data;
    const result = await listAuditLogs(req.auth!.orgId, {
      ...(employeeId !== undefined ? { employeeId } : {}),
      ...(entityType !== undefined ? { entityType: entityType as AuditEntityType } : {}),
      ...(action !== undefined ? { action: action as AuditAction } : {}),
      limit,
      offset,
    });
    res.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao listar audit logs";
    res.status(500).json({ error: message });
  }
});

import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { requireMinRole } from "../middleware/auth.js";
import {
  calculateWorkingDays,
  createLeaveRequest,
  createPublicHoliday,
  deleteLeaveRequest,
  deletePublicHoliday,
  getLeaveBalance,
  getLeaveOverview,
  getLeaveRequests,
  getPublicHolidays,
  suggestDaysEntitled,
  updateLeaveBalance,
  updateLeaveRequest,
  type LeaveType,
} from "../services/hrLeaveService.js";
import { getSupabaseServiceRole } from "../infra/scoped-db/supabase-client.js";
import type { WeeklySchedule } from "../domain/hrTypes.js";

export const hrLeaveRoutes = Router();

function jsonError(res: Response, status: number, msg: string) {
  res.status(status).json({ error: msg });
}

const leaveTypeSchema = z.enum(["vacation", "sick_leave", "justified", "unjustified", "compensatory"]);

const createLeaveSchema = z.object({
  type: leaveTypeSchema,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().nullable().optional(),
});

const updateLeaveSchema = z.object({
  type: leaveTypeSchema.optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().nullable().optional(),
});

const balanceUpdateSchema = z.object({
  daysEntitled: z.number().int().min(0).optional(),
  daysCarriedOver: z.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
});

// ── Feriados ────────────────────────────────────────────────

/** GET /api/hr/leave/holidays?year=2026 */
hrLeaveRoutes.get("/leave/holidays", async (req: Request, res: Response) => {
  try {
    const year = req.query["year"] ? Number(req.query["year"]) : undefined;
    res.json(await getPublicHolidays(year));
  } catch (e) {
    jsonError(res, 500, e instanceof Error ? e.message : "Erro");
  }
});

/** POST /api/hr/leave/holidays — adicionar feriado manual (admin) */
hrLeaveRoutes.post(
  "/leave/holidays",
  requireMinRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { date, name, isNational = false } = req.body as {
        date: string;
        name: string;
        isNational?: boolean;
      };
      if (!date || !name) { jsonError(res, 400, "date e name são obrigatórios"); return; }
      res.status(201).json(await createPublicHoliday(date, name, isNational));
    } catch (e) {
      jsonError(res, 500, e instanceof Error ? e.message : "Erro");
    }
  },
);

/** DELETE /api/hr/leave/holidays/:id */
hrLeaveRoutes.delete(
  "/leave/holidays/:id",
  requireMinRole("admin"),
  async (req: Request, res: Response) => {
    try {
      await deletePublicHoliday(req.params["id"] as string);
      res.status(204).send();
    } catch (e) {
      jsonError(res, 500, e instanceof Error ? e.message : "Erro");
    }
  },
);

// ── Overview global ─────────────────────────────────────────

/** GET /api/hr/leave/overview?year=2026 */
hrLeaveRoutes.get("/leave/overview", async (req: Request, res: Response) => {
  try {
    const year = req.query["year"] ? Number(req.query["year"]) : new Date().getFullYear();
    res.json(await getLeaveOverview(year));
  } catch (e) {
    jsonError(res, 500, e instanceof Error ? e.message : "Erro");
  }
});

// ── Por funcionário ──────────────────────────────────────────

/** GET /api/hr/employees/:id/leave?year=2026&type=vacation */
hrLeaveRoutes.get("/employees/:id/leave", async (req: Request, res: Response) => {
  try {
    const employeeId = req.params["id"] as string;
    const yearRaw = req.query["year"];
    const typeRaw = req.query["type"] as string | undefined;
    const params: { employeeId?: string; year?: number; type?: LeaveType } = { employeeId };
    if (yearRaw) params.year = Number(yearRaw);
    if (typeRaw) params.type = typeRaw as LeaveType;
    res.json(await getLeaveRequests(params));
  } catch (e) {
    jsonError(res, 500, e instanceof Error ? e.message : "Erro");
  }
});

/** POST /api/hr/employees/:id/leave */
hrLeaveRoutes.post(
  "/employees/:id/leave",
  requireMinRole("manager"),
  async (req: Request, res: Response) => {
    try {
      const employeeId = req.params["id"] as string;
      const parsed = createLeaveSchema.safeParse(req.body);
      if (!parsed.success) {
        jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
        return;
      }
      const { type, startDate, endDate, notes } = parsed.data;
      if (endDate < startDate) { jsonError(res, 400, "endDate deve ser >= startDate"); return; }

      // Fetch employee schedule for working days calculation
      const sb = getSupabaseServiceRole();
      let schedule: WeeklySchedule | null = null;
      if (sb) {
        const { data } = await sb
          .from("hr_employees")
          .select("weekly_schedule")
          .eq("id", employeeId)
          .single();
        schedule = (data as Record<string, unknown> | null)?.weekly_schedule as WeeklySchedule | null ?? null;
      }

      const workingDays = await calculateWorkingDays(startDate, endDate, schedule);

      const leave = await createLeaveRequest({
        employeeId,
        type,
        startDate,
        endDate,
        workingDays,
        notes: notes ?? null,
      });
      res.status(201).json(leave);
    } catch (e) {
      jsonError(res, 500, e instanceof Error ? e.message : "Erro");
    }
  },
);

// ── Saldo ───────────────────────────────────────────────────

/** GET /api/hr/employees/:id/leave/balance?year=2026 */
hrLeaveRoutes.get("/employees/:id/leave/balance", async (req: Request, res: Response) => {
  try {
    const employeeId = req.params["id"] as string;
    const year = req.query["year"] ? Number(req.query["year"]) : new Date().getFullYear();

    const sb = getSupabaseServiceRole();
    let hiredAt: string | null = null;
    if (sb) {
      const { data } = await sb
        .from("hr_employees")
        .select("hired_at")
        .eq("id", employeeId)
        .single();
      hiredAt = (data as Record<string, unknown> | null)?.hired_at as string | null ?? null;
    }

    const balance = await getLeaveBalance(employeeId, year, hiredAt);
    const suggested = suggestDaysEntitled(hiredAt, year);
    res.json({ ...balance, suggestedDaysEntitled: suggested });
  } catch (e) {
    jsonError(res, 500, e instanceof Error ? e.message : "Erro");
  }
});

/** PATCH /api/hr/employees/:id/leave/balance/:year */
hrLeaveRoutes.patch(
  "/employees/:id/leave/balance/:year",
  requireMinRole("manager"),
  async (req: Request, res: Response) => {
    try {
      const employeeId = req.params["id"] as string;
      const year = Number(req.params["year"]);
      const parsed = balanceUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
        return;
      }
      const balanceBody: Parameters<typeof updateLeaveBalance>[2] = {};
      if (parsed.data.daysEntitled != null) balanceBody.daysEntitled = parsed.data.daysEntitled;
      if (parsed.data.daysCarriedOver != null) balanceBody.daysCarriedOver = parsed.data.daysCarriedOver;
      if ("notes" in parsed.data) balanceBody.notes = parsed.data.notes ?? null;
      await updateLeaveBalance(employeeId, year, balanceBody);
      res.status(204).send();
    } catch (e) {
      jsonError(res, 500, e instanceof Error ? e.message : "Erro");
    }
  },
);

// ── PATCH / DELETE por ID de ausência ────────────────────────

/** PATCH /api/hr/leave/:id */
hrLeaveRoutes.patch(
  "/leave/:id",
  requireMinRole("manager"),
  async (req: Request, res: Response) => {
    try {
      const id = req.params["id"] as string;
      const parsed = updateLeaveSchema.safeParse(req.body);
      if (!parsed.success) {
        jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
        return;
      }

      const body = parsed.data;

      // Recalculate working days if dates changed
      let workingDays: number | undefined;
      if (body.startDate ?? body.endDate) {
        const sb = getSupabaseServiceRole();
        // Fetch current record to fill missing dates
        const { data: cur } = await sb!
          .from("hr_leave_requests")
          .select("start_date, end_date, employee_id")
          .eq("id", id)
          .single();
        const cur2 = cur as Record<string, unknown>;
        const start = (body.startDate ?? cur2.start_date) as string;
        const end = (body.endDate ?? cur2.end_date) as string;
        const { data: emp } = await sb!
          .from("hr_employees")
          .select("weekly_schedule")
          .eq("id", cur2.employee_id as string)
          .single();
        const schedule = (emp as Record<string, unknown> | null)?.weekly_schedule as WeeklySchedule | null ?? null;
        workingDays = await calculateWorkingDays(start, end, schedule);
      }

      const updateBody: Parameters<typeof updateLeaveRequest>[1] = {};
      if (body.type != null) updateBody.type = body.type;
      if (body.startDate != null) updateBody.startDate = body.startDate;
      if (body.endDate != null) updateBody.endDate = body.endDate;
      if (workingDays != null) updateBody.workingDays = workingDays;
      if ("notes" in body) updateBody.notes = body.notes ?? null;
      res.json(await updateLeaveRequest(id, updateBody));
    } catch (e: unknown) {
      const err = e as Error & { status?: number };
      jsonError(res, err.status ?? 500, err.message);
    }
  },
);

/** DELETE /api/hr/leave/:id */
hrLeaveRoutes.delete(
  "/leave/:id",
  requireMinRole("manager"),
  async (req: Request, res: Response) => {
    try {
      await deleteLeaveRequest(req.params["id"] as string);
      res.status(204).send();
    } catch (e) {
      jsonError(res, 500, e instanceof Error ? e.message : "Erro");
    }
  },
);

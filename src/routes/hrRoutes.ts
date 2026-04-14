import { Router } from "express";
import type { Request, Response } from "express";
import {
  employeeCreateBodySchema,
  employeeUpdateBodySchema,
  employeesListQuerySchema,
  paymentCreateBodySchema,
  paymentUpdateBodySchema,
  paymentsListQuerySchema,
  shiftAttendanceUpsertBodySchema,
  shiftCreateBodySchema,
  shiftUpdateBodySchema,
  shiftsQuerySchema,
} from "../domain/hrTypes.js";
import {
  createEmployee,
  getEmployee,
  listEmployees,
  softDeleteEmployee,
  updateEmployee,
} from "../services/hrEmployeeService.js";
import {
  createPayment,
  deletePayment,
  listPaymentsForEmployee,
  updatePayment,
} from "../services/hrPaymentService.js";
import { upsertShiftAttendance } from "../services/hrShiftAttendanceService.js";
import {
  createShift,
  deleteShift,
  getWorkShiftById,
  listShiftsInRange,
  updateShift,
} from "../services/hrShiftService.js";

export const hrRoutes = Router();

function toQueryRecord(q: Request["query"]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(q)) {
    if (Array.isArray(v)) {
      out[k] = typeof v[0] === "string" ? v[0] : undefined;
    } else if (typeof v === "string") {
      out[k] = v;
    }
  }
  return out;
}

function jsonError(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

// ---------- Employees ----------

hrRoutes.get("/employees", async (req, res) => {
  try {
    const parsed = employeesListQuerySchema.safeParse(toQueryRecord(req.query));
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const { status, limit, offset } = parsed.data;
    const list = await listEmployees({ status, limit, offset });
    res.json(list);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao listar funcionários";
    res.status(500).json({ error: message });
  }
});

hrRoutes.post("/employees", async (req, res) => {
  try {
    const parsed = employeeCreateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const created = await createEmployee(parsed.data);
    res.status(201).json(created);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao criar funcionário";
    res.status(500).json({ error: message });
  }
});

hrRoutes.get("/employees/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      jsonError(res, 400, "id obrigatório");
      return;
    }
    const row = await getEmployee(id);
    if (!row) {
      jsonError(res, 404, "Funcionário não encontrado");
      return;
    }
    res.json(row);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao obter funcionário";
    res.status(500).json({ error: message });
  }
});

hrRoutes.patch("/employees/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      jsonError(res, 400, "id obrigatório");
      return;
    }
    const parsed = employeeUpdateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const updated = await updateEmployee(id, parsed.data);
    res.json(updated);
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Erro ao atualizar funcionário";
    res.status(500).json({ error: message });
  }
});

hrRoutes.delete("/employees/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      jsonError(res, 400, "id obrigatório");
      return;
    }
    const updated = await softDeleteEmployee(id);
    res.json(updated);
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Erro ao desativar funcionário";
    const status = message.includes("não encontrado") ? 404 : 500;
    res.status(status).json({ error: message });
  }
});

// ---------- Shifts ----------

hrRoutes.get("/shifts", async (req, res) => {
  try {
    const parsed = shiftsQuerySchema.safeParse(toQueryRecord(req.query));
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const { from, to, employeeId } = parsed.data;
    const list = await listShiftsInRange({
      from,
      to,
      ...(employeeId != null ? { employeeId } : {}),
    });
    res.json(list);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao listar turnos";
    const status = message.includes("deve ser anterior") ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

hrRoutes.post("/shifts", async (req, res) => {
  try {
    const parsed = shiftCreateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const created = await createShift(parsed.data);
    res.status(201).json(created);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao criar turno";
    const status = message.includes("startTime") ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

hrRoutes.patch("/shifts/:id/attendance", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      jsonError(res, 400, "id obrigatório");
      return;
    }
    const parsed = shiftAttendanceUpsertBodySchema.safeParse(req.body);
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const existing = await getWorkShiftById(id);
    if (!existing) {
      jsonError(res, 404, "Turno não encontrado");
      return;
    }
    const attendance = await upsertShiftAttendance(id, parsed.data);
    res.json({ ...existing, attendance });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Erro ao registar conferência";
    const status =
      message.includes("não encontrado") || message.includes("Turno não")
        ? 404
        : message.includes("employee_qr") ||
            message.includes("registeredByEmployeeId")
          ? 400
          : 500;
    res.status(status).json({ error: message });
  }
});

hrRoutes.patch("/shifts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      jsonError(res, 400, "id obrigatório");
      return;
    }
    const parsed = shiftUpdateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const updated = await updateShift(id, parsed.data);
    res.json(updated);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao atualizar turno";
    const status =
      message.includes("startTime") ||
      message.includes("não encontrado")
        ? message.includes("não encontrado")
          ? 404
          : 400
        : 500;
    res.status(status).json({ error: message });
  }
});

hrRoutes.delete("/shifts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      jsonError(res, 400, "id obrigatório");
      return;
    }
    await deleteShift(id);
    res.status(204).send();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao eliminar turno";
    res.status(500).json({ error: message });
  }
});

// ---------- Payments ----------

hrRoutes.get("/employees/:id/payments", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      jsonError(res, 400, "id obrigatório");
      return;
    }
    const parsed = paymentsListQuerySchema.safeParse(toQueryRecord(req.query));
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const q = parsed.data;
    const filters: {
      from?: string;
      to?: string;
      year?: number;
      month?: number;
    } = {};
    if (q.year != null && q.month != null) {
      filters.year = q.year;
      filters.month = q.month;
    } else if (q.from != null && q.to != null) {
      filters.from = q.from;
      filters.to = q.to;
    }
    const list = await listPaymentsForEmployee(id, filters);
    res.json(list);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao listar pagamentos";
    res.status(500).json({ error: message });
  }
});

hrRoutes.post("/employees/:id/payments", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      jsonError(res, 400, "id obrigatório");
      return;
    }
    const parsed = paymentCreateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const created = await createPayment(id, parsed.data);
    res.status(201).json(created);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao criar pagamento";
    res.status(500).json({ error: message });
  }
});

hrRoutes.patch("/payments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      jsonError(res, 400, "id obrigatório");
      return;
    }
    const parsed = paymentUpdateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const updated = await updatePayment(id, parsed.data);
    res.json(updated);
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Erro ao atualizar pagamento";
    res.status(500).json({ error: message });
  }
});

hrRoutes.delete("/payments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      jsonError(res, 400, "id obrigatório");
      return;
    }
    await deletePayment(id);
    res.status(204).send();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao eliminar pagamento";
    res.status(500).json({ error: message });
  }
});

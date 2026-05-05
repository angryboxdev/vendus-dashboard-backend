import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import { requireMinRole } from "../middleware/auth.js";
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
  listExpiringContracts,
  softDeleteEmployee,
  updateEmployee,
} from "../services/hrEmployeeService.js";
import {
  createPayment,
  deletePayment,
  getPaymentById,
  listPaymentsForEmployee,
  updatePayment,
} from "../services/hrPaymentService.js";
import { deleteShiftAttendance, upsertShiftAttendance } from "../services/hrShiftAttendanceService.js";
import {
  createShift,
  deleteShift,
  getWorkShiftById,
  listShiftsInRange,
  updateShift,
} from "../services/hrShiftService.js";
import { logAudit } from "../services/hrAuditService.js";
import {
  deleteDocument,
  getDocumentSignedUrl,
  listDocuments,
  uploadDocument,
  type DocumentType,
} from "../services/hrDocumentService.js";

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

hrRoutes.post("/employees", requireMinRole("manager"), async (req, res) => {
  try {
    const parsed = employeeCreateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const created = await createEmployee(parsed.data);
    void logAudit({
      entityType: "employee",
      entityId: created.id,
      action: "created",
      description: `Funcionário "${created.fullName}" criado`,
      employeeId: created.id,
      payloadAfter: created,
    });
    res.status(201).json(created);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao criar funcionário";
    res.status(500).json({ error: message });
  }
});

hrRoutes.get("/employees/expiring-contracts", requireMinRole("manager"), async (req, res) => {
  try {
    const withinDays = req.query["days"] != null ? Number(req.query["days"]) : 30;
    const list = await listExpiringContracts(Number.isFinite(withinDays) ? withinDays : 30);
    res.json(list);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao listar contratos";
    res.status(500).json({ error: message });
  }
});

hrRoutes.get("/employees/:id", async (req, res) => {
  try {
    const id = req.params["id"] as string;
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

hrRoutes.patch("/employees/:id", requireMinRole("manager"), async (req, res) => {
  try {
    const id = req.params["id"] as string;
    if (!id) { jsonError(res, 400, "id obrigatório"); return; }
    const parsed = employeeUpdateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const before = await getEmployee(id);
    const updated = await updateEmployee(id, parsed.data);
    res.json(updated);

    const isScheduleOnly =
      Object.keys(parsed.data).length === 1 && "weeklySchedule" in parsed.data;
    const isStatusChange =
      before !== null && parsed.data.status !== undefined && parsed.data.status !== before.status;

    const contractFields = ["baseSalary", "hourlyRate", "salaryType", "employmentType", "hiredAt", "endedAt", "jobRole"] as const;
    type ContractSnapshot = { baseSalary: number | null; hourlyRate: number | null; salaryType: string; employmentType: string; hiredAt: string | null; endedAt: string | null; jobRole: string };
    const toContractSnapshot = (e: typeof updated): ContractSnapshot => ({
      baseSalary: e.baseSalary, hourlyRate: e.hourlyRate, salaryType: e.salaryType,
      employmentType: e.employmentType, hiredAt: e.hiredAt, endedAt: e.endedAt, jobRole: e.jobRole,
    });
    const contractChanged = before !== null && contractFields.some(
      (f) => JSON.stringify(before[f]) !== JSON.stringify(updated[f])
    );

    if (isScheduleOnly) {
      void logAudit({
        entityType: "employee", entityId: id, action: "schedule_updated",
        description: `Escala base de "${updated.fullName}" atualizada`,
        employeeId: id, payloadBefore: before?.weeklySchedule, payloadAfter: updated.weeklySchedule,
      });
    } else if (isStatusChange) {
      void logAudit({
        entityType: "employee", entityId: id, action: "status_changed",
        description: `Estado de "${updated.fullName}" alterado: ${before.status} → ${updated.status}`,
        employeeId: id, payloadBefore: before, payloadAfter: updated,
      });
    } else {
      if (contractChanged && before !== null) {
        void logAudit({
          entityType: "employee", entityId: id, action: "contract_changed",
          description: `Dados contratuais de "${updated.fullName}" alterados`,
          employeeId: id,
          payloadBefore: toContractSnapshot(before),
          payloadAfter: toContractSnapshot(updated),
        });
      }
      void logAudit({
        entityType: "employee", entityId: id, action: "updated",
        description: `Perfil de "${updated.fullName}" atualizado`,
        employeeId: id, payloadBefore: before, payloadAfter: updated,
      });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao atualizar funcionário";
    res.status(500).json({ error: message });
  }
});

hrRoutes.delete("/employees/:id", requireMinRole("manager"), async (req, res) => {
  try {
    const id = req.params["id"] as string;
    if (!id) {
      jsonError(res, 400, "id obrigatório");
      return;
    }
    const updated = await softDeleteEmployee(id);
    res.json(updated);
    void logAudit({
      entityType: "employee", entityId: id, action: "deleted",
      description: `Funcionário "${updated.fullName}" desativado`,
      employeeId: id, payloadBefore: { status: "active" }, payloadAfter: updated,
    });
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

hrRoutes.post("/shifts", requireMinRole("manager"), async (req, res) => {
  try {
    const parsed = shiftCreateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const created = await createShift(parsed.data);
    res.status(201).json(created);
    void logAudit({
      entityType: "shift", entityId: created.id, action: "created",
      description: `Turno de ${created.workDate} (${created.startTime}–${created.endTime}) criado`,
      employeeId: created.employeeId, payloadAfter: created,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao criar turno";
    const status = message.includes("startTime") ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

hrRoutes.patch("/shifts/:id/attendance", requireMinRole("manager"), async (req, res) => {
  try {
    const id = req.params["id"] as string;
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
    const isUpdate = existing.attendance !== null;
    void logAudit({
      entityType: "attendance", entityId: id,
      action: isUpdate ? "attendance_updated" : "attendance_registered",
      description: `Conferência ${isUpdate ? "editada" : "registada"}: ${attendance.status} (${existing.workDate})`,
      employeeId: existing.employeeId,
      payloadBefore: existing.attendance,
      payloadAfter: attendance,
    });
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

hrRoutes.delete("/shifts/:id/attendance", requireMinRole("manager"), async (req, res) => {
  try {
    const id = req.params["id"] as string;
    if (!id) { jsonError(res, 400, "id obrigatório"); return; }
    const existing = await getWorkShiftById(id);
    if (!existing) { jsonError(res, 404, "Turno não encontrado"); return; }
    if (!existing.attendance) { jsonError(res, 404, "Este turno não tem conferência registada"); return; }
    await deleteShiftAttendance(id);
    void logAudit({
      entityType: "attendance", entityId: id,
      action: "attendance_deleted",
      description: `Conferência apagada (${existing.workDate})`,
      employeeId: existing.employeeId,
      payloadBefore: existing.attendance,
      payloadAfter: null,
    });
    res.json({ ...existing, attendance: null });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao apagar conferência";
    res.status(500).json({ error: message });
  }
});

hrRoutes.patch("/shifts/:id", requireMinRole("manager"), async (req, res) => {
  try {
    const id = req.params["id"] as string;
    if (!id) {
      jsonError(res, 400, "id obrigatório");
      return;
    }
    const parsed = shiftUpdateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const before = await getWorkShiftById(id);
    const updated = await updateShift(id, parsed.data);
    res.json(updated);
    void logAudit({
      entityType: "shift", entityId: id, action: "updated",
      description: `Turno de ${updated.workDate} (${updated.startTime}–${updated.endTime}) atualizado`,
      employeeId: updated.employeeId, payloadBefore: before, payloadAfter: updated,
    });
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

hrRoutes.delete("/shifts/:id", requireMinRole("manager"), async (req, res) => {
  try {
    const id = req.params["id"] as string;
    if (!id) {
      jsonError(res, 400, "id obrigatório");
      return;
    }
    const toDelete = await getWorkShiftById(id);
    await deleteShift(id);
    res.status(204).send();
    if (toDelete) {
      void logAudit({
        entityType: "shift", entityId: id, action: "deleted",
        description: `Turno de ${toDelete.workDate} (${toDelete.startTime}–${toDelete.endTime}) apagado`,
        employeeId: toDelete.employeeId, payloadBefore: toDelete,
      });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao eliminar turno";
    res.status(500).json({ error: message });
  }
});

// ---------- Payments ----------

hrRoutes.get("/employees/:id/payments", async (req, res) => {
  try {
    const id = req.params["id"] as string;
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

hrRoutes.post("/employees/:id/payments", requireMinRole("manager"), async (req, res) => {
  try {
    const id = req.params["id"] as string;
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
    void logAudit({
      entityType: "payment", entityId: created.id, action: "created",
      description: `Pagamento de €${created.amount.toFixed(2)} (${created.paymentType}) registado`,
      employeeId: id, payloadAfter: created,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao criar pagamento";
    res.status(500).json({ error: message });
  }
});

hrRoutes.patch("/payments/:id", requireMinRole("manager"), async (req, res) => {
  try {
    const id = req.params["id"] as string;
    if (!id) {
      jsonError(res, 400, "id obrigatório");
      return;
    }
    const parsed = paymentUpdateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const before = await getPaymentById(id);
    const updated = await updatePayment(id, parsed.data);
    res.json(updated);
    void logAudit({
      entityType: "payment", entityId: id, action: "updated",
      description: `Pagamento de €${updated.amount.toFixed(2)} (${updated.paymentType}) atualizado`,
      employeeId: updated.employeeId, payloadBefore: before, payloadAfter: updated,
    });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Erro ao atualizar pagamento";
    res.status(500).json({ error: message });
  }
});

hrRoutes.delete("/payments/:id", requireMinRole("manager"), async (req, res) => {
  try {
    const id = req.params["id"] as string;
    if (!id) {
      jsonError(res, 400, "id obrigatório");
      return;
    }
    const toDelete = await getPaymentById(id);
    await deletePayment(id);
    res.status(204).send();
    if (toDelete) {
      void logAudit({
        entityType: "payment", entityId: id, action: "deleted",
        description: `Pagamento de €${toDelete.amount.toFixed(2)} (${toDelete.paymentType}) apagado`,
        employeeId: toDelete.employeeId, payloadBefore: toDelete,
      });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao eliminar pagamento";
    res.status(500).json({ error: message });
  }
});

// ---------- Documents ----------

const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const VALID_DOC_TYPES = new Set(["contract", "id_card", "nif", "iban", "other"]);

hrRoutes.get("/employees/:id/documents", requireMinRole("manager"), async (req, res) => {
  try {
    const id = req.params["id"] as string;
    if (!id) { jsonError(res, 400, "id obrigatório"); return; }
    const docs = await listDocuments(id);
    res.json(docs);
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro ao listar documentos" });
  }
});

hrRoutes.post("/employees/:id/documents", requireMinRole("manager"), docUpload.single("file"), async (req, res) => {
  try {
    const id = req.params["id"] as string;
    if (!id) { jsonError(res, 400, "id obrigatório"); return; }
    const file = req.file;
    if (!file?.buffer) { jsonError(res, 400, "Ficheiro em falta (field: file)"); return; }
    const documentType = req.body?.document_type as string;
    if (!documentType || !VALID_DOC_TYPES.has(documentType)) {
      jsonError(res, 400, `document_type inválido. Use: ${[...VALID_DOC_TYPES].join(", ")}`);
      return;
    }
    const doc = await uploadDocument({
      employeeId: id,
      documentType: documentType as DocumentType,
      fileName: file.originalname || "document",
      buffer: file.buffer,
      mimeType: file.mimetype || "application/octet-stream",
    });
    res.status(201).json(doc);
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro ao fazer upload" });
  }
});

hrRoutes.get("/employees/:id/documents/:docId/download-url", requireMinRole("manager"), async (req, res) => {
  try {
    const docId = req.params["docId"] as string;
    if (!docId) { jsonError(res, 400, "docId obrigatório"); return; }
    // fetch doc to get storagePath
    const docs = await listDocuments(req.params["id"] as string);
    const doc = docs.find((d) => d.id === docId);
    if (!doc) { jsonError(res, 404, "Documento não encontrado"); return; }
    const url = await getDocumentSignedUrl(doc.storagePath);
    res.json({ url });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro ao gerar URL" });
  }
});

hrRoutes.delete("/employees/:id/documents/:docId", requireMinRole("manager"), async (req, res) => {
  try {
    const docId = req.params["docId"] as string;
    if (!docId) { jsonError(res, 400, "docId obrigatório"); return; }
    await deleteDocument(docId);
    res.status(204).send();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao apagar documento";
    res.status(msg.includes("não encontrado") ? 404 : 500).json({ error: msg });
  }
});

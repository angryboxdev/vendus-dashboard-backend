import { Router } from "express";
import type { Request, Response } from "express";
import { ENV } from "../config/env.js";
import {
  kioskScanBodySchema,
  setKioskPinBodySchema,
} from "../domain/hrTypes.js";
import { getEmployee, setKioskPin } from "../services/hrEmployeeService.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import {
  KioskError,
  getTodayKioskToken,
  kioskScan,
} from "../services/hrKioskService.js";
import { hashPin } from "../utils/kiosk.js";
import { logAudit } from "../services/hrAuditService.js";

export const hrKioskRoutes = Router();

function jsonError(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

// Contador de tentativas por IP (in-memory, reset a cada 60 segundos).
// Limite: 20 tentativas/min por IP para o endpoint público de scan.
const scanRateMap = new Map<string, { count: number; resetAt: number }>();

function checkScanRateLimit(ip: string): boolean {
  const now = Date.now();
  const window = 60_000;
  const limit = 20;
  const entry = scanRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    scanRateMap.set(ip, { count: 1, resetAt: now + window });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

// Limpeza periódica do mapa (a cada 5 min) para não crescer indefinidamente
setInterval(
  () => {
    const now = Date.now();
    for (const [ip, entry] of scanRateMap) {
      if (now > entry.resetAt) scanRateMap.delete(ip);
    }
  },
  5 * 60_000,
);

// ---------- GET /kiosk/daily-token ----------
// Retorna o token HMAC de hoje para o frontend gerar o QR.
// Chamado apenas pelo frontend admin (CORS restringe origens).

hrKioskRoutes.get("/kiosk/daily-token", (_req: Request, res: Response) => {
  try {
    const result = getTodayKioskToken();
    res.json(result);
  } catch (e: unknown) {
    if (e instanceof KioskError) {
      jsonError(res, e.status, e.message);
      return;
    }
    const message = e instanceof Error ? e.message : "Erro interno";
    res.status(500).json({ error: message });
  }
});

// ---------- POST /kiosk/scan ----------
// Endpoint público: recebe token + data + PIN e regista entrada/saída.

hrKioskRoutes.post("/kiosk/scan", async (req: Request, res: Response) => {
  const xff = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress
    ?? "unknown";

  if (!checkScanRateLimit(ip)) {
    jsonError(res, 429, "Demasiadas tentativas. Aguarda um momento.");
    return;
  }

  try {
    const parsed = kioskScanBodySchema.safeParse(req.body);
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const result = await kioskScan(parsed.data);
    res.json(result);
    void logAudit({
      entityType: "attendance",
      entityId: result.employee.id,
      action: result.action === "check_in" ? "kiosk_checkin" : "kiosk_checkout",
      description: `${result.action === "check_in" ? "Entrada" : "Saída"} via kiosk registada às ${result.time} (${result.employee.fullName})`,
      employeeId: result.employee.id,
      payloadAfter: { action: result.action, time: result.time, shift: result.shift },
    });
  } catch (e: unknown) {
    if (e instanceof KioskError) {
      jsonError(res, e.status, e.message);
      return;
    }
    const message = e instanceof Error ? e.message : "Erro interno";
    res.status(500).json({ error: message });
  }
});

// ---------- PATCH /employees/:id/kiosk-pin ----------
// Admin: define ou actualiza o PIN de kiosk de um funcionário.

hrKioskRoutes.patch(
  "/employees/:id/kiosk-pin",
  requireAuth,
  requireMinRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        jsonError(res, 400, "id obrigatório");
        return;
      }
      const parsed = setKioskPinBodySchema.safeParse(req.body);
      if (!parsed.success) {
        jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
        return;
      }
      if (!ENV.HR_KIOSK_HMAC_SECRET) {
        jsonError(res, 503, "Kiosk não configurado no servidor");
        return;
      }
      const existingEmployee = await getEmployee(id);
      const pinHash = hashPin(ENV.HR_KIOSK_HMAC_SECRET, parsed.data.pin);
      const updated = await setKioskPin(id, pinHash);
      res.json(updated);
      void logAudit({
        entityType: "employee", entityId: id, action: "pin_set",
        description: `PIN de kiosk de "${updated.fullName}" ${existingEmployee?.hasKioskPin ? "atualizado" : "definido"}`,
        employeeId: id,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erro ao definir PIN";
      const status = message.includes("não encontrado")
        ? 404
        : message.includes("já está em uso")
          ? 409
          : 500;
      res.status(status).json({ error: message });
    }
  },
);

import { DateTime } from "luxon";
import { ENV } from "../config/env.js";
import { type KioskScanBody, type KioskScanResult } from "../domain/hrTypes.js";
import { getSupabaseServiceRole, isHrSupabaseConfigured } from "../infra/supabaseClient.js";
import { formatHrTimeForApi, normalizeTimeForPg } from "../utils/hrTime.js";
import { generateDailyToken, hashPin, verifyDailyToken } from "../utils/kiosk.js";
import { REPORT_TIMEZONE } from "../utils/lisbonDayInstants.js";
import { findActiveEmployeeByPinHash } from "./hrEmployeeService.js";

export class KioskError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "KioskError";
    this.status = status;
  }
}

function requireKioskSecret(): string {
  if (!ENV.HR_KIOSK_HMAC_SECRET) {
    throw new KioskError("Kiosk não configurado no servidor", 503);
  }
  return ENV.HR_KIOSK_HMAC_SECRET;
}

function requireHr() {
  if (!isHrSupabaseConfigured()) {
    throw new KioskError("RH não configurado no servidor", 503);
  }
  const s = getSupabaseServiceRole();
  if (!s) throw new KioskError("Supabase indisponível", 503);
  return s;
}

/** Retorna o token HMAC para hoje (hora de Lisboa) — usado pelo frontend para gerar o QR. */
export function getTodayKioskToken(): { token: string; date: string } {
  const secret = requireKioskSecret();
  const date = DateTime.now().setZone(REPORT_TIMEZONE).toFormat("yyyy-MM-dd");
  const token = generateDailyToken(secret, date);
  return { token, date };
}

/** Processa o scan do QR: valida token + PIN e regista entrada ou saída. */
export async function kioskScan(body: KioskScanBody): Promise<KioskScanResult> {
  const secret = requireKioskSecret();

  // 1. Verificar token HMAC
  if (!verifyDailyToken(secret, body.token, body.date)) {
    throw new KioskError("QR Code inválido", 401);
  }

  // 2. Verificar que a data é hoje (hora de Lisboa) — rejeita links de dias anteriores
  const todayYmd = DateTime.now().setZone(REPORT_TIMEZONE).toFormat("yyyy-MM-dd");
  if (body.date !== todayYmd) {
    throw new KioskError("QR Code expirado", 401);
  }

  // 3. Encontrar funcionário pelo hash do PIN
  const pinHash = hashPin(secret, body.pin);
  const employee = await findActiveEmployeeByPinHash(pinHash);
  if (!employee) {
    throw new KioskError("PIN incorrecto", 401);
  }

  // 4. Encontrar turno de hoje para este funcionário
  const supabase = requireHr();
  const { data: shiftData, error: shiftError } = await supabase
    .from("hr_work_shifts")
    .select("id, start_time, end_time")
    .eq("employee_id", employee.id)
    .eq("work_date", todayYmd)
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (shiftError) {
    throw new KioskError(`Erro ao obter turno: ${shiftError.message}`, 500);
  }
  if (!shiftData) {
    throw new KioskError("Não tens turno agendado para hoje", 404);
  }

  const shift = shiftData as { id: string; start_time: string; end_time: string };
  const shiftId = shift.id;
  const shiftStartHm = formatHrTimeForApi(shift.start_time);
  const shiftEndHm = formatHrTimeForApi(shift.end_time);

  // 5. Hora actual em Lisboa
  const nowLisbon = DateTime.now().setZone(REPORT_TIMEZONE);
  const currentHm = nowLisbon.toFormat("HH:mm");

  // 6. Verificar conferência existente
  const { data: attData, error: attError } = await supabase
    .from("hr_shift_attendance")
    .select("id, actual_start_time, actual_end_time")
    .eq("work_shift_id", shiftId)
    .maybeSingle();

  if (attError) {
    throw new KioskError(`Erro ao verificar conferência: ${attError.message}`, 500);
  }

  const att = attData as {
    id: string;
    actual_start_time: string | null;
    actual_end_time: string | null;
  } | null;

  const nowIso = nowLisbon.toUTC().toISO()!;

  if (!att) {
    // --- CHECK-IN ---
    const lateMinutes = computeLateMinutes(currentHm, shiftStartHm);
    const status = lateMinutes > 0 ? "late" : "worked_as_planned";

    const { error: insertErr } = await supabase
      .from("hr_shift_attendance")
      .insert({
        work_shift_id: shiftId,
        status,
        actual_start_time: normalizeTimeForPg(currentHm),
        actual_end_time: null,
        late_minutes: lateMinutes > 0 ? lateMinutes : null,
        notes: null,
        registration_source: "employee_qr",
        registered_by_employee_id: employee.id,
        registered_at: nowIso,
        updated_at: nowIso,
      });

    if (insertErr) {
      throw new KioskError(`Erro ao registar entrada: ${insertErr.message}`, 500);
    }

    return {
      action: "check_in",
      employee: { id: employee.id, fullName: employee.fullName },
      time: currentHm,
      shift: { startTime: shiftStartHm, endTime: shiftEndHm },
    };
  }

  if (att.actual_start_time && !att.actual_end_time) {
    // --- CHECK-OUT ---
    const currentStatus = await getCurrentAttendanceStatus(supabase, att.id);
    const leftEarly = isLeftEarly(currentHm, shiftEndHm);
    const newStatus = leftEarly && currentStatus === "worked_as_planned"
      ? "left_early"
      : currentStatus;

    const { error: updateErr } = await supabase
      .from("hr_shift_attendance")
      .update({
        actual_end_time: normalizeTimeForPg(currentHm),
        status: newStatus,
        updated_at: nowIso,
      })
      .eq("id", att.id);

    if (updateErr) {
      throw new KioskError(`Erro ao registar saída: ${updateErr.message}`, 500);
    }

    return {
      action: "check_out",
      employee: { id: employee.id, fullName: employee.fullName },
      time: currentHm,
      shift: { startTime: shiftStartHm, endTime: shiftEndHm },
    };
  }

  // Entrada e saída já registadas
  throw new KioskError("Registo do dia já completo", 409);
}

// ---------- helpers ----------

function timeToMinutes(hm: string): number {
  const m = /^(\d{2}):(\d{2})/.exec(hm);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function computeLateMinutes(currentHm: string, shiftStartHm: string): number {
  return Math.max(0, timeToMinutes(currentHm) - timeToMinutes(shiftStartHm));
}

function isLeftEarly(currentHm: string, shiftEndHm: string): boolean {
  return timeToMinutes(currentHm) < timeToMinutes(shiftEndHm);
}

async function getCurrentAttendanceStatus(
  supabase: ReturnType<typeof getSupabaseServiceRole>,
  attId: string,
): Promise<string> {
  const { data } = await supabase!
    .from("hr_shift_attendance")
    .select("status")
    .eq("id", attId)
    .single();
  return (data as { status: string } | null)?.status ?? "worked_as_planned";
}

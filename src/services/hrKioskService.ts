import { DateTime } from "luxon";
import { ENV } from "../config/env.js";
import { type KioskScanBody, type KioskScanResult } from "../domain/hrTypes.js";
import { createScopedQuery } from "../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../kernel/organization-id.js";
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

/** Retorna o token HMAC para hoje (hora de Lisboa) — usado pelo frontend para gerar o QR. */
export function getTodayKioskToken(): { token: string; date: string } {
  const secret = requireKioskSecret();
  const date = DateTime.now().setZone(REPORT_TIMEZONE).toFormat("yyyy-MM-dd");
  const token = generateDailyToken(secret, date);
  return { token, date };
}

/**
 * Processa o scan do QR: valida token + PIN e regista entrada ou saída.
 *
 * Rota pública sem sessão (D14): `organizationId` e `locationId` vêm do
 * unattended scope no chamador (`hrKioskRoutes.ts`), nunca do request — o
 * kiosk não tem identidade de dispositivo. Isto inclui a procura do
 * funcionário pelo PIN (`findActiveEmployeeByPinHash`), que antes desta
 * ficha era global entre organizações.
 */
export async function kioskScan(
  organizationId: OrganizationId,
  locationId: string,
  body: KioskScanBody,
): Promise<KioskScanResult> {
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
  const employee = await findActiveEmployeeByPinHash(organizationId, pinHash);
  if (!employee) {
    throw new KioskError("PIN incorrecto", 401);
  }

  // 4. Hora actual em Lisboa
  const scoped = createScopedQuery(organizationId);
  const nowLisbon = DateTime.now().setZone(REPORT_TIMEZONE);
  const currentHm = nowLisbon.toFormat("HH:mm");

  type ShiftRow = { id: string; start_time: string; end_time: string; ends_next_day: boolean | null };
  type AttRow = { id: string; actual_start_time: string | null; actual_end_time: string | null } | null;

  let shift: ShiftRow | null = null;
  let att: AttRow = null;
  /** O turno escolhido é de ontem (saída depois da meia-noite). */
  let fromYesterday = false;

  // 5. Saída depois da meia-noite: turno de ONTEM com entrada e sem saída, cujo fim
  // planeado está perto de agora (noturno, ou fecho que passou da meia-noite). Uma
  // saída esquecida ontem à tarde não é apanhada (fim longe de agora).
  const yesterdayYmd = nowLisbon.minus({ days: 1 }).toFormat("yyyy-MM-dd");
  const { data: yesterdayShifts } = await scoped
    .table("hr_work_shifts")
    .select("id, start_time, end_time, ends_next_day")
    .eq("employee_id", employee.id)
    .eq("work_date", yesterdayYmd);
  for (const s of (yesterdayShifts ?? []) as unknown as ShiftRow[]) {
    const plannedEnd = shiftEndMinutes(s);
    const nowFromYesterday = DAY_MINUTES + timeToMinutes(currentHm);
    if (nowFromYesterday - plannedEnd > OVERNIGHT_EXIT_WINDOW_MINUTES) continue;
    const { data: attData } = await scoped
      .table("hr_shift_attendance")
      .select("id, actual_start_time, actual_end_time")
      .eq("work_shift_id", s.id)
      .maybeSingle();
    const a = attData as unknown as AttRow;
    if (a && a.actual_start_time && !a.actual_end_time) {
      shift = s;
      att = a;
      fromYesterday = true;
      break;
    }
  }

  // 6. Turnos de hoje para este funcionário
  const { data: shiftsData, error: shiftError } = shift
    ? { data: [] as ShiftRow[], error: null }
    : await scoped
        .table("hr_work_shifts")
        .select("id, start_time, end_time, ends_next_day")
        .eq("employee_id", employee.id)
        .eq("work_date", todayYmd)
        .order("start_time", { ascending: true });

  if (shiftError) {
    throw new KioskError(`Erro ao obter turno: ${shiftError.message}`, 500);
  }
  if (!shift && (!shiftsData || shiftsData.length === 0)) {
    throw new KioskError("Não tens turno agendado para hoje", 404);
  }

  // 7. Para cada turno (por ordem), verificar conferência — usar o primeiro incompleto
  for (const s of (shift ? [] : shiftsData) as unknown as ShiftRow[]) {
    const { data: attData, error: attError } = await scoped
      .table("hr_shift_attendance")
      .select("id, actual_start_time, actual_end_time")
      .eq("work_shift_id", s.id)
      .maybeSingle();

    if (attError) {
      throw new KioskError(`Erro ao verificar conferência: ${attError.message}`, 500);
    }

    const a = attData as unknown as AttRow;
    // Turno sem registo → pronto para check-in
    // Turno com entrada mas sem saída → pronto para check-out
    if (!a || (a.actual_start_time && !a.actual_end_time)) {
      shift = s;
      att = a;
      break;
    }
  }

  if (!shift) {
    throw new KioskError("Registo do dia já completo", 409);
  }

  const shiftId = shift.id;
  const shiftStartHm = formatHrTimeForApi(shift.start_time);
  const shiftEndHm = formatHrTimeForApi(shift.end_time);

  const nowIso = nowLisbon.toUTC().toISO()!;

  if (!att) {
    // --- CHECK-IN ---
    const lateMinutes = computeLateMinutes(currentHm, shiftStartHm);
    const status = lateMinutes > 0 ? "late" : "worked_as_planned";

    const { error: insertErr } = await scoped
      .table("hr_shift_attendance")
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
        location_id: locationId,
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
    const currentStatus = await getCurrentAttendanceStatus(scoped, att.id);
    const leftEarly = timeToMinutes(currentHm) + (fromYesterday ? DAY_MINUTES : 0) < shiftEndMinutes(shift);
    const newStatus = leftEarly && currentStatus === "worked_as_planned"
      ? "left_early"
      : currentStatus;

    const { error: updateErr } = await scoped
      .table("hr_shift_attendance")
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

const DAY_MINUTES = 24 * 60;
/** Até quanto tempo depois do fim planeado do turno de ontem ainda se aceita a saída nele. */
const OVERNIGHT_EXIT_WINDOW_MINUTES = 6 * 60;

/** Fim planeado em minutos desde o início do dia do turno (noturno → dia seguinte). */
function shiftEndMinutes(s: { start_time: string; end_time: string; ends_next_day: boolean | null }): number {
  const start = timeToMinutes(formatHrTimeForApi(s.start_time));
  const end = timeToMinutes(formatHrTimeForApi(s.end_time));
  return s.ends_next_day || end <= start ? end + DAY_MINUTES : end;
}

async function getCurrentAttendanceStatus(
  scoped: ReturnType<typeof createScopedQuery>,
  attId: string,
): Promise<string> {
  const { data } = await scoped
    .table("hr_shift_attendance")
    .select("status")
    .eq("id", attId)
    .single();
  return (data as unknown as { status: string } | null)?.status ?? "worked_as_planned";
}

import { randomUUID } from "crypto";
import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../../../../utils/lisbonDayInstants.js";
import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";
import type { WorkShift } from "../../domain/entities/work-shift.js";
import { PortalNotLinkedError, PunchRefusedError } from "../../domain/errors.js";
import type { AttendanceRulesRepositoryPort } from "../../domain/ports/out/attendance-rules-repository.port.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { PortalAccountPort } from "../../domain/ports/out/portal-account.port.js";
import type { PunchEventRecord, PunchRepositoryPort } from "../../domain/ports/out/punch-repository.port.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type {
  GetPortalHomePort,
  PortalHomeDTO,
  PortalIdentity,
  PortalShiftDTO,
  PunchResultDTO,
  RegisterPunchCommand,
  RegisterPunchPort,
} from "../../domain/ports/in/portal-me.ports.js";
import { resolveEffectiveRules } from "../../domain/services/attendance-tolerance.service.js";
import { openAttendance, planPunch, PUNCH_REFUSAL_MESSAGES, type PunchShift } from "../../domain/services/punch.service.js";
import { classifyGeofence, decideGeofence, type LocationFence } from "../../domain/services/punch-geofence.service.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";

/** Hora oficial: sempre a do servidor, em Europe/Lisbon (nunca a do telemóvel). */
export interface ServerNow {
  date: string;
  time: string;
  iso: string;
}
export type ServerClock = () => ServerNow;

export const lisbonClock: ServerClock = () => {
  const now = DateTime.now().setZone(REPORT_TIMEZONE);
  return { date: now.toISODate()!, time: now.toFormat("HH:mm"), iso: now.toUTC().toISO()! };
};

const NO_FENCE: LocationFence = { latitude: null, longitude: null, radiusM: 100, policy: "off" };

/** Colaborador ligado à conta autenticada — nunca um id enviado pelo cliente. */
export async function resolvePortalEmployeeId(accounts: PortalAccountPort, identity: PortalIdentity): Promise<string> {
  const employeeId = await accounts.findLinkedEmployeeId(identity.organizationId, identity.userId);
  if (!employeeId) throw new PortalNotLinkedError();
  return employeeId;
}

function shortName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function toPunchShift(s: WorkShift): PunchShift {
  return {
    id: s.id,
    workDate: s.workDate,
    startTime: s.startTime,
    endTime: s.secondEndTime ?? s.endTime,
    endsNextDay: s.endsNextDay,
    locationId: s.locationId,
  };
}

const addDays = (date: string, days: number) => DateTime.fromISO(date, { zone: "utc" }).plus({ days }).toISODate()!;

interface PunchContext {
  employeeId: string;
  shifts: WorkShift[];
  punchShifts: PunchShift[];
  attendance: Awaited<ReturnType<PunchRepositoryPort["findAttendanceByShiftIds"]>>;
  preShiftWindowMinutes: number;
}

/** Turnos publicados de ontem (noturnos ainda abertos) e de hoje + assiduidade + janela de entrada. */
async function loadPunchContext(
  deps: { workShifts: WorkShiftRepositoryPort; punches: PunchRepositoryPort; rules: AttendanceRulesRepositoryPort },
  organizationId: OrganizationId,
  employeeId: string,
  today: string,
): Promise<PunchContext> {
  const shifts = await deps.workShifts.findInRange(organizationId, { from: addDays(today, -1), to: today, employeeId, status: "published" });
  const attendance = await deps.punches.findAttendanceByShiftIds(organizationId, shifts.map((s) => s.id));
  const preShiftWindowMinutes = resolveEffectiveRules(await deps.rules.listVersions(organizationId), today).preShiftWindowMinutes;
  return { employeeId, shifts, punchShifts: shifts.map(toPunchShift), attendance, preShiftWindowMinutes };
}

async function fenceOf(locations: LocationRepositoryPort, organizationId: OrganizationId, locationId: string): Promise<{ fence: LocationFence; name: string }> {
  const location = await locations.findOneForOrganization(organizationId, locationId);
  if (!location) return { fence: NO_FENCE, name: "" };
  return { fence: location.geofence, name: location.name };
}

/**
 * Início do Portal (ticket 03): próximo turno publicado, estado da picagem
 * de hoje e a ação que o botão principal faz — calculada com as mesmas
 * regras da picagem (`planPunch`), para o botão nunca prometer o que o
 * servidor depois recusa.
 */
export class GetPortalHomeUseCase implements GetPortalHomePort {
  constructor(
    private readonly accounts: PortalAccountPort,
    private readonly employees: EmployeeRepositoryPort,
    private readonly workShifts: WorkShiftRepositoryPort,
    private readonly punches: PunchRepositoryPort,
    private readonly rules: AttendanceRulesRepositoryPort,
    private readonly locations: LocationRepositoryPort,
    private readonly clock: ServerClock = lisbonClock,
  ) {}

  async execute(identity: PortalIdentity): Promise<PortalHomeDTO> {
    const { organizationId } = identity;
    const employeeId = await resolvePortalEmployeeId(this.accounts, identity);
    const employee = await this.employees.findById(organizationId, employeeId);
    if (!employee) throw new PortalNotLinkedError();
    const now = this.clock();
    const ctx = await loadPunchContext({ workShifts: this.workShifts, punches: this.punches, rules: this.rules }, organizationId, employeeId, now.date);

    const open = openAttendance(ctx.punchShifts, ctx.attendance);
    const tryIn = planPunch("in", now, ctx.punchShifts, ctx.attendance, ctx.preShiftWindowMinutes);
    const todays = ctx.punchShifts.filter((s) => s.workDate === now.date);

    let state: PortalHomeDTO["punch"]["state"];
    let since: string | null = null;
    let action: PortalHomeDTO["punch"]["action"] = null;
    let blockedReason: PortalHomeDTO["punch"]["blockedReason"] = null;
    let punchShift: PunchShift | null = null;
    if (open) {
      state = "in";
      since = open.attendance.actualStartTime;
      action = "out";
      punchShift = open.shift;
    } else if (tryIn.ok) {
      state = "not_in";
      action = "in";
      punchShift = tryIn.shift;
    } else if (tryIn.refusal.code === "DAY_COMPLETE" || tryIn.refusal.code === "SHIFT_ENDED") {
      const done = ctx.attendance.filter((a) => todays.some((s) => s.id === a.workShiftId) && a.actualEndTime);
      state = done.length > 0 ? "done" : "not_in";
      since = done.map((a) => a.actualEndTime!).sort().at(-1) ?? null;
      blockedReason = tryIn.refusal;
    } else if (tryIn.refusal.code === "NO_SHIFT") {
      state = "no_shift";
    } else {
      state = "not_in";
      action = "in";
      blockedReason = tryIn.refusal;
      punchShift = todays.find((s) => !ctx.attendance.some((a) => a.workShiftId === s.id)) ?? null;
    }

    const nextShift = await this.nextShift(organizationId, employeeId, now);
    const fenceShift = punchShift ?? (nextShift ? { locationId: nextShift.locationId } : null);
    const policy = fenceShift ? (await fenceOf(this.locations, organizationId, fenceShift.locationId)).fence.policy : "off";

    return {
      employee: { id: employee.id, shortName: shortName(employee.fullName) },
      nextShift,
      punch: { state, since, action, blockedReason, geofencePolicy: policy },
    };
  }

  /** Próximo turno publicado que ainda não terminou (hoje ou nos próximos 14 dias). */
  private async nextShift(organizationId: OrganizationId, employeeId: string, now: ServerNow): Promise<PortalShiftDTO | null> {
    const upcoming = await this.workShifts.findInRange(organizationId, { from: now.date, to: addDays(now.date, 14), employeeId, status: "published" });
    const nowMin = Number(now.time.slice(0, 2)) * 60 + Number(now.time.slice(3, 5));
    const next = upcoming
      .filter((s) => {
        if (s.workDate > now.date) return true;
        const p = toPunchShift(s);
        const end = Number(p.endTime.slice(0, 2)) * 60 + Number(p.endTime.slice(3, 5));
        return p.endsNextDay || end > nowMin;
      })
      .sort((a, b) => (a.workDate === b.workDate ? a.startTime.localeCompare(b.startTime) : a.workDate.localeCompare(b.workDate)))[0];
    if (!next) return null;
    const { name } = await fenceOf(this.locations, organizationId, next.locationId);
    return {
      workDate: next.workDate,
      startTime: next.startTime,
      endTime: next.endTime,
      endsNextDay: next.endsNextDay,
      secondStartTime: next.secondStartTime,
      secondEndTime: next.secondEndTime,
      locationId: next.locationId,
      locationName: name,
    };
  }
}

/**
 * Entrada/Saída pelo Portal (tickets 04–05). Hora = servidor; o mesmo
 * `idempotencyKey` (duplo toque, retry depois de timeout, refresh) devolve
 * o evento já gravado em vez de criar outro. Geolocalização classificada
 * aqui a partir da leitura crua do telemóvel; com `block`, fora da zona é
 * recusado (e fica no histórico); `unverified` passa sinalizado.
 */
export class RegisterPunchUseCase implements RegisterPunchPort {
  constructor(
    private readonly accounts: PortalAccountPort,
    private readonly workShifts: WorkShiftRepositoryPort,
    private readonly punches: PunchRepositoryPort,
    private readonly rules: AttendanceRulesRepositoryPort,
    private readonly locations: LocationRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
    private readonly clock: ServerClock = lisbonClock,
  ) {}

  async execute(command: RegisterPunchCommand): Promise<PunchResultDTO> {
    const { organizationId } = command;
    const employeeId = await resolvePortalEmployeeId(this.accounts, command);

    const replay = await this.punches.findEventByIdempotencyKey(organizationId, command.idempotencyKey);
    if (replay) return this.replayOf(replay, employeeId);

    const now = this.clock();
    const ctx = await loadPunchContext({ workShifts: this.workShifts, punches: this.punches, rules: this.rules }, organizationId, employeeId, now.date);
    const plan = planPunch(command.kind, now, ctx.punchShifts, ctx.attendance, ctx.preShiftWindowMinutes);
    if (!plan.ok) {
      throw new PunchRefusedError(plan.refusal.code, PUNCH_REFUSAL_MESSAGES[plan.refusal.code], { ...plan.refusal });
    }

    const { fence, name } = await fenceOf(this.locations, organizationId, plan.shift.locationId);
    const geo = classifyGeofence(fence, command.location);
    const decision = decideGeofence(fence.policy, geo);
    // Localização só é guardada quando a política do local a pede (minimização).
    const reading = fence.policy !== "off" && command.location?.kind === "reading" ? command.location : null;

    if (!decision.allowed) {
      await this.auditLog.record({
        organizationId,
        actor: command.actor,
        entityType: "attendance_punch",
        entityId: plan.shift.id,
        employeeId,
        action: `refused_${command.kind}`,
        description: `${command.kind === "in" ? "Entrada" : "Saída"} recusada pelo Portal: fora da zona de ${name} (${geo.distanceM ?? "?"} m)`,
        after: { geofence: geo, accuracyM: reading?.accuracyM ?? null },
        correlationId: randomUUID(),
      });
      throw new PunchRefusedError("OUTSIDE_ZONE", `Está fora da zona do local (a cerca de ${Math.round(geo.distanceM ?? 0)} m). Aproxime-se e tente novamente.`, {
        distanceM: geo.distanceM,
        radiusM: fence.radiusM,
      });
    }

    let event: PunchEventRecord;
    try {
      event = await this.punches.recordPunch(organizationId, {
        kind: plan.kind,
        employeeId,
        workShiftId: plan.shift.id,
        workDate: plan.shift.workDate,
        locationId: plan.shift.locationId,
        attendanceId: plan.kind === "out" ? plan.attendance.id : null,
        status: plan.status,
        lateMinutes: plan.kind === "in" ? plan.lateMinutes : null,
        time: plan.time,
        serverAt: now.iso,
        latitude: reading?.latitude ?? null,
        longitude: reading?.longitude ?? null,
        accuracyM: reading?.accuracyM ?? null,
        distanceM: geo.distanceM,
        geofenceStatus: geo.status,
        unverifiedReason: geo.reason,
        idempotencyKey: command.idempotencyKey,
        userId: command.userId,
      });
    } catch (e) {
      // Pedido concorrente com a mesma chave (duplo toque muito rápido) — devolve o que ficou gravado.
      const concurrent = await this.punches.findEventByIdempotencyKey(organizationId, command.idempotencyKey);
      if (concurrent) return this.replayOf(concurrent, employeeId);
      throw e;
    }

    const zone =
      geo.status === "inside"
        ? `dentro da zona, ${Math.round(geo.distanceM ?? 0)} m`
        : geo.status === "outside"
          ? `FORA da zona, ${Math.round(geo.distanceM ?? 0)} m`
          : geo.status === "unverified"
            ? `localização não verificada: ${geo.reason}`
            : "sem verificação de localização";
    await this.auditLog.record({
      organizationId,
      actor: command.actor,
      entityType: "attendance_punch",
      entityId: event.attendanceId,
      employeeId,
      action: plan.kind,
      description: `${plan.kind === "in" ? "Entrada" : "Saída"} registada pelo Portal às ${plan.time} (${zone})`,
      after: { eventId: event.id, geofence: geo, flagged: decision.alert },
      correlationId: randomUUID(),
    });

    return {
      kind: plan.kind,
      time: plan.time,
      serverAt: event.serverAt,
      geofence: { status: geo.status, reason: geo.reason, distanceM: geo.distanceM },
      flagged: decision.alert,
      replay: false,
    };
  }

  private replayOf(event: PunchEventRecord, employeeId: string): PunchResultDTO {
    // Uma chave de outro colaborador nunca é "reutilizada" (não revela nada sobre ela).
    if (event.employeeId !== employeeId) throw new PunchRefusedError("INVALID_KEY", "Pedido inválido, tente novamente.");
    return {
      kind: event.kind,
      time: DateTime.fromISO(event.serverAt).setZone(REPORT_TIMEZONE).toFormat("HH:mm"),
      serverAt: event.serverAt,
      geofence: { status: event.geofenceStatus, reason: event.unverifiedReason, distanceM: event.distanceM },
      flagged: event.geofenceStatus === "outside" || event.geofenceStatus === "unverified",
      replay: true,
    };
  }
}

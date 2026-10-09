import { randomUUID } from "crypto";
import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";
import type { DocumentRepositoryPort } from "../../../documents/domain/ports/out/document-repository.port.js";
import { Absence, InvalidAbsenceError } from "../../domain/entities/absence.js";
import type { WorkShift } from "../../domain/entities/work-shift.js";
import { REQUEST_REASONS } from "../../domain/entities/portal-request.js";
import { PortalResourceNotFoundError } from "../../domain/errors.js";
import type { AbsenceRepositoryPort } from "../../domain/ports/out/absence-repository.port.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { HolidayReadPort } from "../../domain/ports/out/holiday-read.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { PortalRequestRepositoryPort } from "../../domain/ports/out/portal-request-repository.port.js";
import type { PositionRepositoryPort } from "../../domain/ports/out/position-repository.port.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type {
  AbsenceBoardDTO,
  AbsenceImpactDTO,
  AbsenceRecordDTO,
  CancelAbsencePort,
  GetAbsenceBoardPort,
  LeaveBalanceRowDTO,
  ListLeaveBalancesPort,
  SetLeaveBalancePort,
  PreviewAbsencePort,
  RegisterAbsenceCommand,
  RegisterAbsencePort,
} from "../../domain/ports/in/absences.ports.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { durationLabel, workingDaysBetween } from "../../domain/services/absence-impact.service.js";
import { MAX_BALANCE_DAYS, suggestDaysEntitled, vacationDaysInYear } from "../../domain/services/leave-balance.service.js";

/**
 * Férias & Ausências 2.0 (RH 2.0 tickets 05; mockup 2026-10-07). Os turnos
 * já marcados no período **ficam** e contam como conflito — o gerente
 * resolve nas Escalas (decisão 2026-10-07). O saldo de férias só aparece
 * no Hub.
 */

const hoursOf = (s: WorkShift) => `${s.startTime}–${s.endTime}${s.secondStartTime ? ` · ${s.secondStartTime}–${s.secondEndTime}` : ""}`;

async function holidaySet(holidays: HolidayReadPort, org: OrganizationId, from: string, to: string): Promise<Set<string>> {
  return new Set((await holidays.findInRange(org, from, to)).map((h) => h.date));
}

/** Saldo de férias disponível no ano (direito + transitados − férias ativas que começam no ano). */
async function vacationAvailable(absences: AbsenceRepositoryPort, org: OrganizationId, employeeId: string, year: number, excludeId?: string): Promise<number | null> {
  const balance = await absences.findBalance(org, employeeId, year);
  if (!balance) return null;
  const used = (await absences.findActiveForEmployee(org, employeeId, `${year}-01-01`, `${year}-12-31`))
    .filter((a) => a.type === "vacation" && a.startDate.startsWith(String(year)) && a.id !== excludeId)
    .reduce((n, a) => n + a.toProps().workingDays, 0);
  return balance.daysEntitled + balance.daysCarriedOver - used;
}

export class GetAbsenceBoardUseCase implements GetAbsenceBoardPort {
  constructor(
    private readonly absences: AbsenceRepositoryPort,
    private readonly requests: PortalRequestRepositoryPort,
    private readonly documents: DocumentRepositoryPort,
    private readonly employees: EmployeeRepositoryPort,
    private readonly positions: PositionRepositoryPort,
    private readonly locations: LocationRepositoryPort,
    private readonly workShifts: WorkShiftRepositoryPort,
    private readonly holidays: HolidayReadPort,
  ) {}

  async execute(command: { organizationId: OrganizationId; from: string; to: string }): Promise<AbsenceBoardDTO> {
    const org = command.organizationId;
    const [absences, requests, allPending, pendingDocs, employees, positions, locations] = await Promise.all([
      this.absences.findInRange(org, command.from, command.to),
      this.requests.findOverlapping(org, command.from, command.to),
      this.requests.findPending(org, ["justify_absence", "day_off"]),
      this.documents.findPendingValidation(org),
      this.employees.findMany(org, { status: "all" }),
      this.positions.findAll(org),
      this.locations.findAllForOrganization(org),
    ]);
    const emp = new Map(employees.map((e) => [e.id, e]));
    const posName = new Map(positions.map((p) => [p.id, p.name]));
    const locName = new Map(locations.map((l) => [l.id, l.name]));

    // Turnos publicados no intervalo coberto pelos registos — para "turnos afetados".
    const spans = [...absences.map((a) => [a.startDate, a.endDate]), ...requests.map((r) => [r.startDate, r.endDate])];
    const spanFrom = spans.reduce((m, [s]) => (s! < m ? s! : m), command.from);
    const spanTo = spans.reduce((m, [, e]) => (e! > m ? e! : m), command.to);
    const shifts = await this.workShifts.findInRange(org, { from: spanFrom, to: spanTo, status: "published" });
    const affected = (employeeId: string, from: string, to: string) => shifts.filter((s) => s.employeeId === employeeId && s.workDate >= from && s.workDate <= to).length;

    const who = (employeeId: string) => {
      const e = emp.get(employeeId);
      return {
        employeeId,
        employeeName: e?.fullName ?? employeeId,
        positionName: e?.positionId ? (posName.get(e.positionId) ?? null) : null,
        locationId: e?.primaryLocationId ?? null,
        locationName: e?.primaryLocationId ? (locName.get(e.primaryLocationId) ?? null) : null,
      };
    };

    const records: AbsenceRecordDTO[] = [];
    for (const a of absences) {
      const p = a.toProps();
      records.push({
        id: p.id,
        source: "absence",
        ...who(p.employeeId),
        type: p.type,
        startDate: p.startDate,
        endDate: p.endDate,
        startTime: p.startTime,
        endTime: p.endTime,
        duration: durationLabel(p),
        status: p.status === "active" ? "approved" : "cancelled",
        affectedShifts: p.status === "active" ? affected(p.employeeId, p.startDate, p.endDate) : 0,
        notes: p.notes,
        origin: p.source,
        decisionNote: p.cancelReason,
      });
    }
    for (const r of requests) {
      if (r.status === "approved") continue; // aprovado = já é uma ausência (acima)
      const p = r.toProps();
      records.push({
        id: p.id,
        source: "request",
        ...who(p.employeeId),
        type: p.kind === "justify_absence" ? "justified" : "authorized_absence",
        startDate: p.startDate,
        endDate: p.endDate,
        startTime: null,
        endTime: null,
        duration: `${r.days} ${r.days === 1 ? "dia" : "dias"}`,
        status: p.status === "pending" ? "pending" : p.status === "rejected" ? "rejected" : "cancelled",
        affectedShifts: p.status === "pending" ? affected(p.employeeId, p.startDate, p.endDate) : 0,
        notes: [REQUEST_REASONS[p.kind][p.reasonCode] ?? p.reasonCode, p.reasonText].filter(Boolean).join(" — "),
        origin: "portal",
        decisionNote: p.decisionNote,
      });
    }
    records.sort((x, y) => x.startDate.localeCompare(y.startDate) || x.employeeName.localeCompare(y.employeeName, "pt"));

    const holidays = (await this.holidays.findInRange(org, command.from, command.to)).map((h) => ({ date: h.date, name: h.name }));
    return {
      records,
      holidays,
      attention: {
        pendingRequests: allPending.length,
        pendingDocuments: pendingDocs.length,
        shiftConflicts: records.filter((r) => r.source === "absence" && r.status === "approved" && r.affectedShifts > 0).length,
      },
    };
  }
}

export class PreviewAbsenceUseCase implements PreviewAbsencePort {
  constructor(
    private readonly absences: AbsenceRepositoryPort,
    private readonly workShifts: WorkShiftRepositoryPort,
    private readonly holidays: HolidayReadPort,
    private readonly employees: EmployeeRepositoryPort,
  ) {}

  async execute(command: RegisterAbsenceCommand): Promise<AbsenceImpactDTO> {
    const org = command.organizationId;
    const draft = Absence.register({ ...command, workingDays: 0, createdBy: command.actor });
    const days = workingDaysBetween(command.startDate, command.endDate, await holidaySet(this.holidays, org, command.startDate, command.endDate));
    const [shifts, others, own] = await Promise.all([
      this.workShifts.findInRange(org, { from: command.startDate, to: command.endDate, employeeId: command.employeeId, status: "published" }),
      this.absences.findInRange(org, command.startDate, command.endDate),
      this.absences.findActiveForEmployee(org, command.employeeId, command.startDate, command.endDate),
    ]);
    const othersAbsent = [...new Set(others.filter((a) => a.isActive && a.employeeId !== command.employeeId).map((a) => a.employeeId))];
    const names: string[] = [];
    for (const id of othersAbsent) names.push((await this.employees.findById(org, id))?.fullName ?? id);

    let balance: AbsenceImpactDTO["balance"] = null;
    if (command.type === "vacation") {
      const available = await vacationAvailable(this.absences, org, command.employeeId, Number(command.startDate.slice(0, 4)));
      balance = available == null ? { defined: false, available: null, after: null } : { defined: true, available, after: available - days };
    }
    const p = draft.toProps();
    return {
      workingDays: command.duration === "day" ? days : 0,
      duration: durationLabel({ ...p, workingDays: days }),
      balance,
      affectedShifts: shifts.map((s) => ({ workDate: s.workDate, hours: hoursOf(s) })),
      othersAbsent: names,
      overlapsExisting: own.length > 0,
    };
  }
}

export class RegisterAbsenceUseCase implements RegisterAbsencePort {
  constructor(
    private readonly absences: AbsenceRepositoryPort,
    private readonly holidays: HolidayReadPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: RegisterAbsenceCommand): Promise<{ id: string }> {
    const org = command.organizationId;
    const own = await this.absences.findActiveForEmployee(org, command.employeeId, command.startDate, command.endDate);
    if (own.length > 0) throw new InvalidAbsenceError("Já existe uma ausência deste colaborador neste período.");
    const days = workingDaysBetween(command.startDate, command.endDate, await holidaySet(this.holidays, org, command.startDate, command.endDate));
    const saved = await this.absences.create(org, Absence.register({ ...command, workingDays: days, createdBy: command.actor }));
    await this.auditLog.record({
      organizationId: org,
      actor: command.actor,
      entityType: "absence",
      entityId: saved.id,
      employeeId: command.employeeId,
      action: "absence_registered",
      description: `Ausência registada (${saved.type}) de ${saved.startDate} a ${saved.endDate}`,
      after: saved.toProps(),
      correlationId: randomUUID(),
    });
    return { id: saved.id };
  }
}

export class CancelAbsenceUseCase implements CancelAbsencePort {
  constructor(
    private readonly absences: AbsenceRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: { organizationId: OrganizationId; actor: string; id: string; reason: string }): Promise<void> {
    const absence = await this.absences.findById(command.organizationId, command.id);
    if (!absence) throw new PortalResourceNotFoundError("Ausência");
    const cancelled = await this.absences.update(command.organizationId, absence.cancel(command.actor, command.reason));
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "absence",
      entityId: cancelled.id,
      employeeId: cancelled.employeeId,
      action: "absence_cancelled",
      description: `Ausência cancelada (${cancelled.startDate} a ${cancelled.endDate}): ${command.reason}`,
      before: absence.toProps(),
      after: cancelled.toProps(),
      correlationId: randomUUID(),
    });
  }
}

/** Separador "Saldos": colaboradores ativos, saldo do ano (ou sugestão), gozados, marcados e disponível. */
export class ListLeaveBalancesUseCase implements ListLeaveBalancesPort {
  constructor(
    private readonly absences: AbsenceRepositoryPort,
    private readonly employees: EmployeeRepositoryPort,
    private readonly positions: PositionRepositoryPort,
    private readonly today: () => string,
  ) {}

  async execute(command: { organizationId: OrganizationId; year: number }): Promise<LeaveBalanceRowDTO[]> {
    const org = command.organizationId;
    const y = command.year;
    const [employees, balances, absences, positions] = await Promise.all([
      this.employees.findMany(org, { status: "active" }),
      this.absences.findBalances(org, y),
      this.absences.findInRange(org, `${y}-01-01`, `${y}-12-31`),
      this.positions.findAll(org),
    ]);
    const posName = new Map(positions.map((p) => [p.id, p.name]));
    const today = this.today();
    return employees
      .map((e) => {
        const b = balances.get(e.id);
        const suggested = suggestDaysEntitled(e.hiredAt, y);
        const entitled = b?.daysEntitled ?? suggested;
        const carried = b?.daysCarriedOver ?? 0;
        const { taken, scheduled } = vacationDaysInYear(
          absences.filter((a) => a.employeeId === e.id).map((a) => a.toProps()),
          y,
          today,
        );
        return {
          employeeId: e.id,
          employeeName: e.fullName,
          positionName: e.positionId ? (posName.get(e.positionId) ?? null) : null,
          defined: !!b,
          daysEntitled: entitled,
          daysCarriedOver: carried,
          suggested,
          taken,
          scheduled,
          available: entitled + carried - taken - scheduled,
        };
      })
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName, "pt"));
  }
}

export class SetLeaveBalanceUseCase implements SetLeaveBalancePort {
  constructor(
    private readonly absences: AbsenceRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(c: { organizationId: OrganizationId; actor: string; employeeId: string; year: number; daysEntitled: number; daysCarriedOver: number }): Promise<void> {
    const ok = (n: number) => Number.isInteger(n) && n >= 0 && n <= MAX_BALANCE_DAYS;
    if (!ok(c.daysEntitled) || !ok(c.daysCarriedOver)) throw new InvalidAbsenceError(`Os dias têm de ser números inteiros entre 0 e ${MAX_BALANCE_DAYS}.`);
    if (!Number.isInteger(c.year) || c.year < 2000 || c.year > 2100) throw new InvalidAbsenceError("Ano inválido.");
    const before = await this.absences.findBalance(c.organizationId, c.employeeId, c.year);
    const after = { daysEntitled: c.daysEntitled, daysCarriedOver: c.daysCarriedOver };
    await this.absences.saveBalance(c.organizationId, c.employeeId, c.year, after);
    await this.auditLog.record({
      organizationId: c.organizationId,
      actor: c.actor,
      entityType: "absence",
      entityId: `balance:${c.employeeId}:${c.year}`,
      employeeId: c.employeeId,
      action: "balance_updated",
      description: `Saldo de férias ${c.year}: ${c.daysEntitled} dias de direito + ${c.daysCarriedOver} transitados`,
      before,
      after,
      correlationId: randomUUID(),
    });
  }
}

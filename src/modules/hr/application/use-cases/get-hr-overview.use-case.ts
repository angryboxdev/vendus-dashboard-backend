import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../../../../utils/lisbonDayInstants.js";
import type { Employee } from "../../domain/entities/employee.js";
import type { EmployeeDocument } from "../../domain/entities/employee-document.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { EmployeeDocumentRepositoryPort } from "../../domain/ports/out/employee-document-repository.port.js";
import type { ShiftAttendanceReadPort, ShiftOccurrence } from "../../domain/ports/out/shift-attendance-read.port.js";
import type { ActiveLeave, LeaveReadPort, LeaveType } from "../../domain/ports/out/leave-read.port.js";
import type { PaymentReadPort } from "../../domain/ports/out/payment-read.port.js";
import {
  computeMandatoryDocumentsSummary,
  DEFAULT_MANDATORY_CATEGORIES,
} from "../../domain/services/document-status.service.js";
import { computeProfileCompletionPercent } from "../../domain/services/profile-completeness.service.js";
import {
  computeShiftExceptions,
  computeShiftState,
  shiftNeedsReview,
  type ShiftState,
} from "../../domain/services/overview-shift-state.service.js";
import { computeConflictEmployeeIds, computeTodayOperationKpis } from "../../domain/services/overview-kpi.service.js";
import { prioritizeAndDedupAlerts, type OverviewAlert } from "../../domain/services/overview-alert.service.js";
import type {
  GetHrOverviewCommand,
  GetHrOverviewPort,
  HrOverviewDTO,
  OverviewOperationRowDTO,
  BlockResult,
  OverviewTeamDTO,
  OverviewTodayDTO,
  OverviewPendingDTO,
  OverviewAlertDTO,
} from "../../domain/ports/in/overview.ports.js";

const MAX_ALERTS = 5;
const MAX_OPERATION_ROWS = 5;
const ADMISSION_ALERT_LOOKAHEAD_DAYS = 30;

const LEAVE_LABELS: Record<LeaveType, string> = {
  vacation: "Férias",
  sick_leave: "Baixa",
  justified: "Falta justificada",
  unjustified: "Falta injustificada",
  compensatory: "Folga",
};

type Settled<T> = { ok: true; data: T } | { ok: false; reason: string };

async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha desconhecida" };
  }
}

function unavailable<T>(reason: string): BlockResult<T> {
  return { status: "unavailable", reason };
}

type OperationState = ShiftState | "CONFLITO" | "FERIAS" | "BAIXA" | "FOLGA";

export class GetHrOverviewUseCase implements GetHrOverviewPort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly employeeDocumentRepository: EmployeeDocumentRepositoryPort,
    private readonly shiftAttendanceRead: ShiftAttendanceReadPort,
    private readonly leaveRead: LeaveReadPort,
    private readonly paymentRead: PaymentReadPort,
  ) {}

  async execute(command: GetHrOverviewCommand): Promise<HrOverviewDTO> {
    const now = DateTime.now().setZone(REPORT_TIMEZONE);
    const today = now.toISODate()!;

    const employeesResult: Settled<Employee[]> = await settle(
      this.employeeRepository.findMany(command.organizationId, { status: "all" }),
    );
    const activeEmployees = employeesResult.ok ? employeesResult.data.filter((e) => e.status === "active") : [];
    const employeeNameById = new Map<string, string>(
      employeesResult.ok ? employeesResult.data.map((e) => [e.id, e.fullName]) : [],
    );

    const [documentsResult, shiftsResult, leaveResult, unpaidResult] = await Promise.all([
      employeesResult.ok
        ? settle(
            this.employeeDocumentRepository.findCurrentByEmployeeIds(
              command.organizationId,
              activeEmployees.map((e) => e.id),
            ),
          )
        : Promise.resolve<Settled<EmployeeDocument[]>>({ ok: false, reason: "employees indisponível" }),
      settle(
        this.shiftAttendanceRead.findShiftsInRange(command.organizationId, {
          from: today,
          to: today,
          ...(command.locationId && { locationId: command.locationId }),
        }),
      ),
      settle(this.leaveRead.findActiveOnDate(command.organizationId, today)),
      settle(this.paymentRead.countUnpaid(command.organizationId)),
    ]);

    return {
      generatedAt: now.toISO()!,
      scope: { organizationId: String(command.organizationId), locationId: command.locationId ?? null },
      team: this.buildTeamBlock(employeesResult, documentsResult, now),
      today: this.buildTodayBlock(shiftsResult, leaveResult, now),
      pending: this.buildPendingBlock(shiftsResult, unpaidResult, now),
      alerts: this.buildAlertsBlock(employeesResult, documentsResult, shiftsResult, employeeNameById, now),
      operation: this.buildOperationBlock(shiftsResult, leaveResult, employeeNameById, now),
    };
  }

  private buildTeamBlock(
    employeesResult: Settled<Employee[]>,
    documentsResult: Settled<EmployeeDocument[]>,
    now: DateTime,
  ): BlockResult<OverviewTeamDTO> {
    if (!employeesResult.ok) return unavailable(employeesResult.reason);

    const activeEmployees = employeesResult.data.filter((e) => e.status === "active");
    const admissionsThisMonth = activeEmployees.filter((e) => {
      if (!e.hiredAt) return false;
      const hired = DateTime.fromISO(e.hiredAt, { zone: REPORT_TIMEZONE });
      return hired.isValid && hired.year === now.year && hired.month === now.month;
    }).length;
    const incompleteProfiles = activeEmployees.filter((e) => computeProfileCompletionPercent(e) < 100).length;

    let documentsExpiringSoon = 0;
    if (documentsResult.ok) {
      const documentsByEmployee = new Map<string, EmployeeDocument[]>();
      for (const doc of documentsResult.data) {
        const list = documentsByEmployee.get(doc.employeeId) ?? [];
        list.push(doc);
        documentsByEmployee.set(doc.employeeId, list);
      }
      for (const e of activeEmployees) {
        const summary = computeMandatoryDocumentsSummary(
          DEFAULT_MANDATORY_CATEGORIES,
          documentsByEmployee.get(e.id) ?? [],
        );
        documentsExpiringSoon += summary.expiringSoonCount;
      }
    }

    return {
      status: "ok",
      data: {
        activeEmployees: activeEmployees.length,
        admissionsThisMonth,
        incompleteProfiles,
        documentsExpiringSoon,
      },
    };
  }

  private buildTodayBlock(
    shiftsResult: Settled<ShiftOccurrence[]>,
    leaveResult: Settled<ActiveLeave[]>,
    now: DateTime,
  ): BlockResult<OverviewTodayDTO> {
    if (!shiftsResult.ok) return unavailable(shiftsResult.reason);
    if (!leaveResult.ok) return unavailable(leaveResult.reason);

    const leaveEmployeeIds = new Set(leaveResult.data.map((l) => l.employeeId));
    return { status: "ok", data: computeTodayOperationKpis(shiftsResult.data, leaveEmployeeIds, now) };
  }

  private buildPendingBlock(
    shiftsResult: Settled<ShiftOccurrence[]>,
    unpaidResult: Settled<number>,
    now: DateTime,
  ): BlockResult<OverviewPendingDTO> {
    if (!shiftsResult.ok) return unavailable(shiftsResult.reason);
    if (!unpaidResult.ok) return unavailable(unpaidResult.reason);

    const shiftsToReviewCount = shiftsResult.data.filter((s) => shiftNeedsReview(s, now)).length;
    return { status: "ok", data: { shiftsToReviewCount, unpaidPaymentsCount: unpaidResult.data } };
  }

  private buildAlertsBlock(
    employeesResult: Settled<Employee[]>,
    documentsResult: Settled<EmployeeDocument[]>,
    shiftsResult: Settled<ShiftOccurrence[]>,
    employeeNameById: Map<string, string>,
    now: DateTime,
  ): BlockResult<OverviewAlertDTO[]> {
    if (!shiftsResult.ok && !(employeesResult.ok && documentsResult.ok)) {
      return unavailable("fontes de alertas indisponíveis");
    }

    const candidates: OverviewAlert[] = [];

    if (shiftsResult.ok) {
      for (const shift of shiftsResult.data) {
        if (shift.attendanceStatus === "cancelled") continue;
        const exceptions = computeShiftExceptions(shift, now);
        const name = employeeNameById.get(shift.employeeId) ?? shift.employeeId;
        if (exceptions.includes("SEM_SAIDA")) {
          candidates.push({
            alertType: "shift_no_checkout",
            entityId: shift.shiftId,
            severity: "CRITICA",
            occurredAt: `${shift.workDate}T${shift.startTime}`,
            employeeId: shift.employeeId,
            employeeName: name,
            message: "Turno sem saída registada",
          });
        }
        if (exceptions.includes("SEM_ENTRADA")) {
          candidates.push({
            alertType: "shift_no_checkin",
            entityId: shift.shiftId,
            severity: "ALTA",
            occurredAt: `${shift.workDate}T${shift.startTime}`,
            employeeId: shift.employeeId,
            employeeName: name,
            message: "Saída registada sem entrada correspondente",
          });
        }
        if (computeShiftState(shift, now) === "ATRASADO_AGUARDANDO_ENTRADA") {
          candidates.push({
            alertType: "shift_late_no_arrival",
            entityId: shift.shiftId,
            severity: "MEDIA",
            occurredAt: `${shift.workDate}T${shift.startTime}`,
            employeeId: shift.employeeId,
            employeeName: name,
            message: "Entrada em atraso, ainda não registada",
          });
        }
      }
      for (const employeeId of computeConflictEmployeeIds(shiftsResult.data, now)) {
        candidates.push({
          alertType: "attendance_conflict",
          entityId: employeeId,
          severity: "CRITICA",
          occurredAt: now.toISO()!,
          employeeId,
          employeeName: employeeNameById.get(employeeId) ?? employeeId,
          message: "Duas presenças abertas em simultâneo — requer revisão",
        });
      }
    }

    if (employeesResult.ok && documentsResult.ok) {
      const documentsByEmployee = new Map<string, EmployeeDocument[]>();
      for (const doc of documentsResult.data) {
        const list = documentsByEmployee.get(doc.employeeId) ?? [];
        list.push(doc);
        documentsByEmployee.set(doc.employeeId, list);
      }
      for (const e of employeesResult.data.filter((e) => e.status === "active")) {
        for (const doc of documentsByEmployee.get(e.id) ?? []) {
          if (doc.status === "removed" || !doc.expiresAt) continue;
          const expiresAt = DateTime.fromISO(doc.expiresAt, { zone: REPORT_TIMEZONE });
          if (expiresAt.isValid && expiresAt < now.startOf("day")) {
            candidates.push({
              alertType: "document_expired",
              entityId: doc.id,
              severity: "CRITICA",
              occurredAt: doc.expiresAt,
              employeeId: e.id,
              employeeName: e.fullName,
              message: `Documento expirado (${doc.category})`,
            });
          }
        }
        if (computeProfileCompletionPercent(e) < 100) {
          candidates.push({
            alertType: "incomplete_profile",
            entityId: e.id,
            severity: "BAIXA",
            occurredAt: e.updatedAt,
            employeeId: e.id,
            employeeName: e.fullName,
            message: "Dados pessoais incompletos",
          });
        }
      }
    }

    return { status: "ok", data: prioritizeAndDedupAlerts(candidates).slice(0, MAX_ALERTS) };
  }

  private buildOperationBlock(
    shiftsResult: Settled<ShiftOccurrence[]>,
    leaveResult: Settled<ActiveLeave[]>,
    employeeNameById: Map<string, string>,
    now: DateTime,
  ): BlockResult<OverviewOperationRowDTO[]> {
    if (!shiftsResult.ok) return unavailable(shiftsResult.reason);
    if (!leaveResult.ok) return unavailable(leaveResult.reason);

    const leaveByEmployee = new Map(leaveResult.data.map((l) => [l.employeeId, l.type]));
    const conflictIds = new Set(computeConflictEmployeeIds(shiftsResult.data, now));

    const byEmployee = new Map<string, ShiftOccurrence[]>();
    for (const s of shiftsResult.data.filter((s) => s.attendanceStatus !== "cancelled")) {
      const list = byEmployee.get(s.employeeId) ?? [];
      list.push(s);
      byEmployee.set(s.employeeId, list);
    }

    const rows: Array<OverviewOperationRowDTO & { urgencyRank: number }> = [];
    const seenEmployeeIds = new Set<string>();

    for (const [employeeId, shifts] of byEmployee) {
      seenEmployeeIds.add(employeeId);
      const representative = this.pickRepresentativeShift(shifts, now);
      const state: OperationState = conflictIds.has(employeeId) ? "CONFLITO" : computeShiftState(representative, now);
      rows.push({
        employeeId,
        employeeName: employeeNameById.get(employeeId) ?? employeeId,
        state,
        lastEvent: this.formatLastEvent(representative, state),
        locationId: representative.locationId,
        urgencyRank: this.urgencyRank(state),
      });
    }

    for (const [employeeId, type] of leaveByEmployee) {
      if (seenEmployeeIds.has(employeeId)) continue;
      const state: OperationState =
        type === "vacation" ? "FERIAS" : type === "sick_leave" ? "BAIXA" : type === "compensatory" ? "FOLGA" : "AUSENTE_OPERACIONAL";
      rows.push({
        employeeId,
        employeeName: employeeNameById.get(employeeId) ?? employeeId,
        state,
        lastEvent: LEAVE_LABELS[type],
        locationId: null,
        urgencyRank: this.urgencyRank(state),
      });
    }

    rows.sort((a, b) => a.urgencyRank - b.urgencyRank);
    return {
      status: "ok",
      data: rows.slice(0, MAX_OPERATION_ROWS).map(({ urgencyRank: _urgencyRank, ...row }) => row),
    };
  }

  private pickRepresentativeShift(shifts: ShiftOccurrence[], now: DateTime): ShiftOccurrence {
    const open = shifts.find((s) => computeShiftState(s, now) === "PRESENTE");
    if (open) return open;
    const notFinalized = shifts.find((s) => computeShiftState(s, now) !== "FINALIZADO");
    return notFinalized ?? shifts[0]!;
  }

  private formatLastEvent(shift: ShiftOccurrence, state: OperationState): string {
    if (shift.actualStartTime && shift.actualEndTime) return `Saída ${shift.actualEndTime}`;
    if (shift.actualStartTime) return `Entrada ${shift.actualStartTime}`;
    if (state === "AGENDADO" || state === "EM_TOLERANCIA") return `Turno previsto ${shift.startTime}`;
    return "Sem marcação registada";
  }

  private urgencyRank(state: OperationState): number {
    switch (state) {
      case "CONFLITO":
        return 0;
      case "AUSENTE_OPERACIONAL":
        return 1;
      case "ATRASADO_AGUARDANDO_ENTRADA":
        return 2;
      case "EM_TOLERANCIA":
        return 3;
      case "PRESENTE":
        return 4;
      case "AGENDADO":
        return 5;
      case "FERIAS":
      case "BAIXA":
      case "FOLGA":
        return 6;
      case "FINALIZADO":
      default:
        return 7;
    }
  }
}

import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../../../../utils/lisbonDayInstants.js";
import type { Employee } from "../../domain/entities/employee.js";
import type { Document as EmployeeDocument } from "../../../documents/domain/entities/document.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { DocumentRepositoryPort as EmployeeDocumentRepositoryPort } from "../../../documents/domain/ports/out/document-repository.port.js";
import type { ShiftAttendanceReadPort, ShiftOccurrence } from "../../domain/ports/out/shift-attendance-read.port.js";
import type { ActiveLeaveRange, LeaveReadPort, LeaveType } from "../../domain/ports/out/leave-read.port.js";
import type { PaymentReadPort } from "../../domain/ports/out/payment-read.port.js";
import type { DocumentCategoryRepositoryPort } from "../../../documents/domain/ports/out/document-category-repository.port.js";
import type { DocumentCategoryDefinition } from "../../../documents/domain/entities/document-category.js";
import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";
import {
  applicableCategoriesFor,
  buildDynamicRequirements,
  computeMandatoryDocumentsSummary,
  DEFAULT_MANDATORY_REQUIREMENTS,
  DOCUMENT_CATEGORY_BASE_LABELS,
} from "../../domain/services/document-status.service.js";
import { computeProfileCompletionPercent } from "../../domain/services/profile-completeness.service.js";
import {
  computeOperationDisplayState,
  computeShiftExceptions,
  computeShiftState,
  describeShiftSchedule,
  describeSituation,
  shiftNeedsReview,
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
const ADMISSION_ALERT_LOOKAHEAD_DAYS = 30;

const LEAVE_STATE: Record<LeaveType, string> = {
  vacation: "FERIAS",
  sick_leave: "BAIXA",
  compensatory: "FOLGA",
  justified: "AUSENTE",
  unjustified: "AUSENTE",
  authorized_absence: "FOLGA",
  license: "AUSENTE",
  other: "AUSENTE",
};

function formatEndDate(iso: string): string {
  const d = DateTime.fromISO(iso, { zone: REPORT_TIMEZONE });
  return d.isValid ? d.toFormat("dd/MM") : iso;
}

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

export class GetHrOverviewUseCase implements GetHrOverviewPort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly employeeDocumentRepository: EmployeeDocumentRepositoryPort,
    private readonly shiftAttendanceRead: ShiftAttendanceReadPort,
    private readonly leaveRead: LeaveReadPort,
    private readonly paymentRead: PaymentReadPort,
    private readonly documentCategoryRepository: DocumentCategoryRepositoryPort,
    private readonly locationRepository: LocationRepositoryPort,
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
    // Falha isolada, como as restantes fontes: sem categorias configuráveis,
    // o bloco "team"/os alertas de documento degradam para só o requisito
    // fixo de identificação, em vez de derrubar a resposta inteira.
    const categoryDefsResult = await settle(
      this.documentCategoryRepository.findMany(command.organizationId, { activeOnly: true }),
    );
    const categoryDefs = categoryDefsResult.ok ? categoryDefsResult.data : [];

    const [documentsResult, shiftsResult, leaveResult, unpaidResult, locationsResult] = await Promise.all([
      employeesResult.ok
        ? settle(
            this.employeeDocumentRepository.findCurrentByOwners(command.organizationId, "employee", activeEmployees.map((e) => e.id),
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
      settle(this.leaveRead.findActiveInRange(command.organizationId, today, today)),
      settle(this.paymentRead.countUnpaid(command.organizationId)),
      settle(this.locationRepository.findAllForOrganization(command.organizationId)),
    ]);
    const locationNameById = new Map<string, string>(
      locationsResult.ok ? locationsResult.data.map((l) => [l.id, l.name]) : [],
    );

    return {
      generatedAt: now.toISO()!,
      scope: { organizationId: String(command.organizationId), locationId: command.locationId ?? null },
      team: this.buildTeamBlock(employeesResult, documentsResult, categoryDefs, now),
      today: this.buildTodayBlock(shiftsResult, leaveResult, now),
      pending: this.buildPendingBlock(shiftsResult, unpaidResult, now),
      alerts: this.buildAlertsBlock(employeesResult, documentsResult, shiftsResult, employeeNameById, categoryDefs, now),
      operation: this.buildOperationBlock(shiftsResult, leaveResult, employeeNameById, locationNameById, now),
    };
  }

  private buildTeamBlock(
    employeesResult: Settled<Employee[]>,
    documentsResult: Settled<EmployeeDocument[]>,
    categoryDefs: readonly DocumentCategoryDefinition[],
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
    let missingDocumentsCount = 0;
    if (documentsResult.ok) {
      const documentsByEmployee = new Map<string, EmployeeDocument[]>();
      for (const doc of documentsResult.data) {
        const list = documentsByEmployee.get(doc.ownerId) ?? [];
        list.push(doc);
        documentsByEmployee.set(doc.ownerId, list);
      }
      for (const e of activeEmployees) {
        const applicable = applicableCategoriesFor(categoryDefs, e);
        const requirements = [...DEFAULT_MANDATORY_REQUIREMENTS, ...buildDynamicRequirements(applicable)];
        const summary = computeMandatoryDocumentsSummary(requirements, documentsByEmployee.get(e.id) ?? []);
        documentsExpiringSoon += summary.expiringSoonCount;
        missingDocumentsCount += summary.missingRequirements.length;
      }
    }

    return {
      status: "ok",
      data: {
        activeEmployees: activeEmployees.length,
        admissionsThisMonth,
        incompleteProfiles,
        documentsExpiringSoon,
        missingDocumentsCount,
      },
    };
  }

  private buildTodayBlock(
    shiftsResult: Settled<ShiftOccurrence[]>,
    leaveResult: Settled<ActiveLeaveRange[]>,
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
    categoryDefs: readonly DocumentCategoryDefinition[],
    now: DateTime,
  ): BlockResult<OverviewAlertDTO[]> {
    const labelBySlug = new Map<string, string>([
      ...Object.entries(DOCUMENT_CATEGORY_BASE_LABELS),
      ...categoryDefs.map((c): [string, string] => [c.slug, c.label]),
    ]);
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
        const list = documentsByEmployee.get(doc.ownerId) ?? [];
        list.push(doc);
        documentsByEmployee.set(doc.ownerId, list);
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
              message: `Documento expirado (${labelBySlug.get(doc.category) ?? doc.category})`,
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

  /**
   * "Hoje na operação" — task "Melhorar Hoje na operação": Estado (curto)
   * separado de Situação (contextual), horário do turno (repartido/
   * noturno incluídos), Local resolvido para nome, e o `shiftId` de um
   * turno "por conferir" para permitir abrir a conferência diretamente a
   * partir daqui. Sem limite de linhas (a antiga `MAX_OPERATION_ROWS`
   * mostrava só os 5 primeiros por urgência, escondendo o resto da
   * equipa) — o frontend mostra tudo num contentor com scroll próprio, sem
   * alterar o resto do layout da Visão Geral (ver README, "Design
   * decisions").
   */
  private buildOperationBlock(
    shiftsResult: Settled<ShiftOccurrence[]>,
    leaveResult: Settled<ActiveLeaveRange[]>,
    employeeNameById: Map<string, string>,
    locationNameById: Map<string, string>,
    now: DateTime,
  ): BlockResult<OverviewOperationRowDTO[]> {
    if (!shiftsResult.ok) return unavailable(shiftsResult.reason);
    if (!leaveResult.ok) return unavailable(leaveResult.reason);

    const leaveByEmployee = new Map(leaveResult.data.map((l) => [l.employeeId, l]));
    const conflictIds = new Set(computeConflictEmployeeIds(shiftsResult.data, now));

    const byEmployee = new Map<string, ShiftOccurrence[]>();
    for (const s of shiftsResult.data.filter((s) => s.attendanceStatus !== "cancelled")) {
      const list = byEmployee.get(s.employeeId) ?? [];
      list.push(s);
      byEmployee.set(s.employeeId, list);
    }

    const rows: Array<OverviewOperationRowDTO & { urgencyRank: number; sortKey: string }> = [];
    const seenEmployeeIds = new Set<string>();

    for (const [employeeId, shifts] of byEmployee) {
      seenEmployeeIds.add(employeeId);
      const representative = this.pickRepresentativeShift(shifts, now);
      // "Um funcionário = uma linha" mesmo com 2+ turnos no mesmo dia (raro — o caso comum de turno repartido já é 1 só registo com 2 períodos): junta os períodos de TODOS os turnos do dia, não só o do representativo escolhido para o Estado.
      const shiftToday = [...shifts]
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .flatMap((s) => describeShiftSchedule(s));
      const employeeName = employeeNameById.get(employeeId) ?? employeeId;
      const locationName = locationNameById.get(representative.locationId) ?? null;

      if (conflictIds.has(employeeId)) {
        const openCount = shifts.filter((s) => computeShiftState(s, now) === "PRESENTE").length;
        rows.push({
          employeeId,
          employeeName,
          state: "CONFLITO",
          situation: `${openCount} marcações abertas`,
          situationWarning: null,
          shiftToday,
          locationId: representative.locationId,
          locationName,
          reviewShiftId: null,
          urgencyRank: 0,
          sortKey: representative.startTime,
        });
        continue;
      }

      const displayState = computeOperationDisplayState(representative, now);
      const needsReview = shiftNeedsReview(representative, now);
      const { situation, situationWarning } = describeSituation(representative, displayState, now);
      const hasOccurrence = representative.attendanceStatus === "late" || situationWarning != null;
      rows.push({
        employeeId,
        employeeName,
        state: displayState,
        situation,
        situationWarning,
        shiftToday,
        locationId: representative.locationId,
        locationName,
        reviewShiftId: needsReview ? representative.shiftId : null,
        urgencyRank: this.urgencyRank(displayState, needsReview, hasOccurrence),
        sortKey: representative.startTime,
      });
    }

    for (const [employeeId, leave] of leaveByEmployee) {
      if (seenEmployeeIds.has(employeeId)) continue;
      const state = LEAVE_STATE[leave.type];
      rows.push({
        employeeId,
        employeeName: employeeNameById.get(employeeId) ?? employeeId,
        state,
        situation: `Até ${formatEndDate(leave.endDate)}`,
        situationWarning: null,
        shiftToday: null,
        locationId: null,
        locationName: null,
        reviewShiftId: null,
        urgencyRank: this.urgencyRank(state, false, false),
        sortKey: "99:99",
      });
    }

    rows.sort((a, b) => (a.urgencyRank !== b.urgencyRank ? a.urgencyRank - b.urgencyRank : a.sortKey.localeCompare(b.sortKey)));
    return {
      status: "ok",
      data: rows.map(({ urgencyRank: _urgencyRank, sortKey: _sortKey, ...row }) => row),
    };
  }

  private pickRepresentativeShift(shifts: ShiftOccurrence[], now: DateTime): ShiftOccurrence {
    const open = shifts.find((s) => computeShiftState(s, now) === "PRESENTE");
    if (open) return open;
    const notFinalized = shifts.find((s) => computeShiftState(s, now) !== "FINALIZADO");
    return notFinalized ?? shifts[0]!;
  }

  /**
   * Prioridade operacional ("Melhorar Hoje na operação — refinado", secção
   * 13): Conflito > Ausente > Atrasado > outras inconsistências
   * (`needsReview`, ex: turno "Sem saída" há muito tempo) > presente com
   * ocorrência (atraso registado OU inconsistência sinalizada, ex: "1º
   * turno sem entrada") > presente normal > em tolerância > agendado >
   * intervalo > férias/folga/baixa > finalizado (mais baixa — já resolvido,
   * sem nada a decidir, a task não o enumera). Nota: o exemplo da secção 14
   * do documento mostra "Em tolerância" antes de "Presente com ocorrência"
   * — contradiz a própria lista numerada da secção 13 (que dá prioridade
   * mais alta a "presente com ocorrência"); seguiu-se a lista numerada, por
   * ser a regra explícita, não o exemplo ilustrativo.
   */
  private urgencyRank(state: string, needsReview: boolean, hasOccurrence: boolean): number {
    if (state === "CONFLITO") return 0;
    if (state === "AUSENTE") return 1;
    if (state === "ATRASADO") return 2;
    if (needsReview) return 3;
    if (state === "PRESENTE" && hasOccurrence) return 4;
    if (state === "PRESENTE") return 5;
    if (state === "EM_TOLERANCIA") return 6;
    if (state === "AGENDADO") return 7;
    if (state === "INTERVALO") return 8;
    if (state === "FERIAS" || state === "BAIXA" || state === "FOLGA") return 9;
    return 10; // FINALIZADO
  }
}

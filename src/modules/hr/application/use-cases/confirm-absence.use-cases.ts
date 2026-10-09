import { Absence, InvalidAbsenceError, type AbsenceProps } from "../../domain/entities/absence.js";
import { REQUEST_REASONS } from "../../domain/entities/portal-request.js";
import { ConfirmAbsenceChoiceRequiredError, PendingAbsenceRequestError } from "../../domain/errors.js";
import type { AbsenceRepositoryPort } from "../../domain/ports/out/absence-repository.port.js";
import type { HolidayReadPort } from "../../domain/ports/out/holiday-read.port.js";
import type { PortalRequestRepositoryPort } from "../../domain/ports/out/portal-request-repository.port.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { CorrectShiftAttendancePort } from "../../domain/ports/in/attendance-conference.ports.js";
import type {
  AbsenceCandidateDTO,
  ConfirmAbsenceCommand,
  ConfirmAbsencePort,
  ConfirmAbsencePreviewDTO,
  ConfirmAbsenceResultDTO,
  OccurrenceRef,
  PreviewConfirmAbsencePort,
} from "../../domain/ports/in/confirm-absence.ports.js";
import { compatibleAbsences, type OccurrenceWindow } from "../../domain/services/absence-match.service.js";
import { durationLabel, workingDaysBetween } from "../../domain/services/absence-impact.service.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";

/**
 * "Confirmar ausência" (task Assiduidade, 2026-10-08): o gestor não escolhe
 * entre criar e associar — o servidor procura ausências compatíveis:
 * 1 → vincula; várias → o gestor escolhe; pedido do Portal pendente → não
 * cria nem aprova (o gestor revê o pedido); nenhuma → cria UM registo em
 * Férias & Ausências. A ocorrência fecha sempre por uma correção que guarda
 * a ligação (`absence_id`).
 */

async function windowOf(workShifts: WorkShiftRepositoryPort, org: OrganizationId, ref: OccurrenceRef): Promise<OccurrenceWindow> {
  const shift = ref.workShiftId ? await workShifts.findById(org, ref.workShiftId) : null;
  return { workDate: ref.workDate, startTime: shift?.startTime ?? null, endTime: shift?.secondEndTime ?? shift?.endTime ?? null, endsNextDay: shift?.endsNextDay ?? false };
}

function toCandidate(p: AbsenceProps): AbsenceCandidateDTO {
  return { id: p.id, type: p.type, startDate: p.startDate, endDate: p.endDate, startTime: p.startTime, endTime: p.endTime, duration: durationLabel(p) };
}

async function analyse(deps: { absences: AbsenceRepositoryPort; requests: PortalRequestRepositoryPort; workShifts: WorkShiftRepositoryPort }, org: OrganizationId, ref: OccurrenceRef) {
  const [window, own, requests] = await Promise.all([
    windowOf(deps.workShifts, org, ref),
    deps.absences.findActiveForEmployee(org, ref.employeeId, ref.workDate, ref.workDate),
    deps.requests.findOverlapping(org, ref.workDate, ref.workDate),
  ]);
  const candidates = compatibleAbsences(own.map((a) => a.toProps()), window);
  const pending = requests.find((r) => r.employeeId === ref.employeeId && r.status === "pending") ?? null;
  return { window, candidates, pending };
}

export class PreviewConfirmAbsenceUseCase implements PreviewConfirmAbsencePort {
  constructor(
    private readonly absences: AbsenceRepositoryPort,
    private readonly requests: PortalRequestRepositoryPort,
    private readonly workShifts: WorkShiftRepositoryPort,
  ) {}

  async execute(command: OccurrenceRef & { organizationId: OrganizationId }): Promise<ConfirmAbsencePreviewDTO> {
    const { candidates, pending, window } = await analyse({ absences: this.absences, requests: this.requests, workShifts: this.workShifts }, command.organizationId, command);
    const base = { shiftStart: window.startTime, shiftEnd: window.endTime, endsNextDay: window.endsNextDay };
    if (candidates.length === 1) return { ...base, match: "single", candidates: candidates.map(toCandidate), pendingRequest: null };
    if (candidates.length > 1) return { ...base, match: "multiple", candidates: candidates.map(toCandidate), pendingRequest: null };
    if (pending) {
      const p = pending.toProps();
      return {
        ...base,
        match: "pending_request",
        candidates: [],
        pendingRequest: { id: p.id, kind: p.kind, startDate: p.startDate, endDate: p.endDate, reasonLabel: REQUEST_REASONS[p.kind][p.reasonCode] ?? p.reasonCode, reasonText: p.reasonText },
      };
    }
    return { ...base, match: "none", candidates: [], pendingRequest: null };
  }
}

export class ConfirmAbsenceUseCase implements ConfirmAbsencePort {
  constructor(
    private readonly absences: AbsenceRepositoryPort,
    private readonly requests: PortalRequestRepositoryPort,
    private readonly workShifts: WorkShiftRepositoryPort,
    private readonly holidays: HolidayReadPort,
    private readonly correct: CorrectShiftAttendancePort,
  ) {}

  async execute(command: ConfirmAbsenceCommand): Promise<ConfirmAbsenceResultDTO> {
    const org = command.organizationId;
    const { candidates, pending, window } = await analyse({ absences: this.absences, requests: this.requests, workShifts: this.workShifts }, org, command);

    let absence: AbsenceProps;
    let outcome: ConfirmAbsenceResultDTO["outcome"];
    if (command.absenceId) {
      const chosen = candidates.find((c) => c.id === command.absenceId);
      if (!chosen) throw new InvalidAbsenceError("Essa ausência não corresponde a esta ocorrência.");
      absence = chosen;
      outcome = "linked";
    } else if (candidates.length === 1) {
      absence = candidates[0]!;
      outcome = "linked";
    } else if (candidates.length > 1) {
      throw new ConfirmAbsenceChoiceRequiredError();
    } else if (pending) {
      throw new PendingAbsenceRequestError(pending.id);
    } else {
      const n = command.newAbsence;
      if (!n) throw new InvalidAbsenceError("Indique o tipo de ausência.");
      // Turno inteiro (ou noturno, ou sem turno) = dia; horas diferentes do turno = parcial.
      const fullShift = !n.startTime || !n.endTime || window.endsNextDay || !window.startTime || (n.startTime === window.startTime && n.endTime === window.endTime);
      const days = workingDaysBetween(command.workDate, command.workDate, new Set((await this.holidays.findInRange(org, command.workDate, command.workDate)).map((h) => h.date)));
      const created = await this.absences.create(
        org,
        Absence.register({
          employeeId: command.employeeId,
          type: n.type,
          duration: fullShift ? "day" : "hours",
          startDate: command.workDate,
          endDate: command.workDate,
          ...(fullShift ? {} : { startTime: n.startTime, endTime: n.endTime }),
          notes: n.notes ?? null,
          workingDays: days,
          createdBy: command.actor,
        }),
      );
      absence = created.toProps();
      outcome = "created";
    }

    const label = `${absence.type}${absence.startTime ? ` ${absence.startTime}–${absence.endTime}` : ""}`;
    const issue = await this.correct.execute({
      organizationId: org,
      actor: command.actor,
      workShiftId: command.workShiftId,
      attendanceId: command.attendanceId,
      employeeId: command.employeeId,
      workDate: command.workDate,
      locationId: command.locationId,
      // Falta injustificada continua a contar como ausência; as restantes ficam justificadas.
      correctionType: absence.type === "unjustified" ? "mark_absence" : "justify_no_impact",
      reason: outcome === "linked" ? `Vinculada à ausência já registada em Férias & Ausências (${label})` : `Ausência registada em Férias & Ausências (${label})`,
      notes: command.newAbsence?.notes ?? null,
      absenceId: absence.id,
    });
    return { outcome, fullDay: !absence.startTime, absence: toCandidate(absence), issue };
  }
}

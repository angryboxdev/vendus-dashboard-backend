import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../../../../utils/lisbonDayInstants.js";
import type { AttendanceRulesRepositoryPort } from "../../domain/ports/out/attendance-rules-repository.port.js";
import type { AttendanceRulesVersion } from "../../domain/entities/attendance-rules.js";
import { DEFAULT_ATTENDANCE_RULES } from "../../domain/entities/attendance-rules.js";
import type { AttendanceRulesConfigDTO, GetAttendanceRulesCommand, GetAttendanceRulesPort } from "../../domain/ports/in/attendance-rules.ports.js";

/** Versão vigente hoje: `effectiveFrom` mais recente já iniciada (empate por `createdAt` desc). */
export function pickCurrentVersion(versions: AttendanceRulesVersion[], today: string): AttendanceRulesVersion | null {
  const candidates = versions.filter((v) => v.effectiveFrom <= today);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.effectiveFrom === b.effectiveFrom ? a.createdAt.localeCompare(b.createdAt) : a.effectiveFrom.localeCompare(b.effectiveFrom)));
  return candidates[candidates.length - 1]!;
}

export class GetAttendanceRulesUseCase implements GetAttendanceRulesPort {
  constructor(private readonly attendanceRulesRepository: AttendanceRulesRepositoryPort) {}

  async execute(command: GetAttendanceRulesCommand): Promise<AttendanceRulesConfigDTO> {
    const versions = await this.attendanceRulesRepository.listVersions(command.organizationId);
    const today = DateTime.now().setZone(REPORT_TIMEZONE).toISODate()!;
    const current = pickCurrentVersion(versions, today);

    if (!current) {
      return { ...DEFAULT_ATTENDANCE_RULES, effectiveFrom: today, updatedBy: "—", updatedAt: today };
    }
    return {
      entryToleranceMinutes: current.entryToleranceMinutes,
      earlyExitToleranceMinutes: current.earlyExitToleranceMinutes,
      absenceThresholdMinutes: current.absenceThresholdMinutes,
      preShiftWindowMinutes: current.preShiftWindowMinutes,
      postShiftWindowMinutes: current.postShiftWindowMinutes,
      standardShiftMinutes: current.standardShiftMinutes,
      closingToleranceMinutes: current.closingToleranceMinutes,
      doubleShiftFromMinutes: current.doubleShiftFromMinutes,
      controlStartDate: current.controlStartDate,
      effectiveFrom: current.effectiveFrom,
      updatedBy: current.changedBy,
      updatedAt: current.createdAt,
    };
  }
}

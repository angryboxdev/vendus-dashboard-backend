import { randomUUID } from "crypto";
import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../../../../utils/lisbonDayInstants.js";
import type { AttendanceRulesRepositoryPort } from "../../domain/ports/out/attendance-rules-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { AttendanceRulesConfigDTO, UpdateAttendanceRulesCommand, UpdateAttendanceRulesPort } from "../../domain/ports/in/attendance-rules.ports.js";
import { GetAttendanceRulesUseCase, pickCurrentVersion } from "./get-attendance-rules.use-case.js";
import { assertWorkdayRules } from "../../domain/services/workday.service.js";

/**
 * Fase 2.1 — insere uma NOVA versão (nunca UPDATE) com `effectiveFrom =
 * hoje`. Sem seletor de data passada no frontend — uma alteração nunca
 * reclassifica um período já decorrido (ver
 * `attendance-tolerance.service.ts`, `resolveEffectiveRules`). Mesmo
 * esqueleto de `CloseMonthlyPeriodUseCase`: ler (estado atual) → gravar
 * → `auditLog.record` → devolver estado recalculado.
 */
export class UpdateAttendanceRulesUseCase implements UpdateAttendanceRulesPort {
  constructor(
    private readonly attendanceRulesRepository: AttendanceRulesRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
    private readonly getAttendanceRules: GetAttendanceRulesUseCase,
  ) {}

  async execute(command: UpdateAttendanceRulesCommand): Promise<AttendanceRulesConfigDTO> {
    assertWorkdayRules(command);
    const versions = await this.attendanceRulesRepository.listVersions(command.organizationId);
    const today = DateTime.now().setZone(REPORT_TIMEZONE).toISODate()!;
    const previous = pickCurrentVersion(versions, today);

    const saved = await this.attendanceRulesRepository.save(command.organizationId, {
      id: randomUUID(),
      organizationId: String(command.organizationId),
      entryToleranceMinutes: command.entryToleranceMinutes,
      earlyExitToleranceMinutes: command.earlyExitToleranceMinutes,
      absenceThresholdMinutes: command.absenceThresholdMinutes,
      preShiftWindowMinutes: command.preShiftWindowMinutes,
      postShiftWindowMinutes: command.postShiftWindowMinutes,
      standardShiftMinutes: command.standardShiftMinutes,
      closingToleranceMinutes: command.closingToleranceMinutes,
      doubleShiftFromMinutes: command.doubleShiftFromMinutes,
      controlStartDate: command.controlStartDate,
      effectiveFrom: today,
      changedBy: command.actor,
      createdAt: DateTime.now().toISO()!,
    });

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "attendance_rules",
      entityId: saved.id,
      employeeId: "",
      action: "updated",
      description: `Regras de assiduidade atualizadas, vigentes a partir de ${today}`,
      before: previous,
      after: saved,
      correlationId: randomUUID(),
    });

    return this.getAttendanceRules.execute({ organizationId: command.organizationId });
  }
}

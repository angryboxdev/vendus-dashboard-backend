import type { AttendanceRulesRepositoryPort } from "../../domain/ports/out/attendance-rules-repository.port.js";
import { ATTENDANCE_RULES_FIELDS } from "../../domain/entities/attendance-rules.js";
import type { AttendanceRuleChangeEntryDTO, ListAttendanceRuleChangesCommand, ListAttendanceRuleChangesPort } from "../../domain/ports/in/attendance-rules.ports.js";

/**
 * Fase 2.1 — o histórico por campo que o frontend mostra ("Histórico de
 * alterações") é DERIVADO aqui, comparando cada par de versões
 * consecutivas (`hr_attendance_rules` guarda snapshots completos, não
 * diffs). A 1ª versão nunca gera entradas — é a baseline, não uma
 * "alteração" (task, secção 4).
 */
export class ListAttendanceRuleChangesUseCase implements ListAttendanceRuleChangesPort {
  constructor(private readonly attendanceRulesRepository: AttendanceRulesRepositoryPort) {}

  async execute(command: ListAttendanceRuleChangesCommand): Promise<AttendanceRuleChangeEntryDTO[]> {
    const versions = await this.attendanceRulesRepository.listVersions(command.organizationId);
    const sorted = [...versions].sort((a, b) =>
      a.effectiveFrom === b.effectiveFrom ? a.createdAt.localeCompare(b.createdAt) : a.effectiveFrom.localeCompare(b.effectiveFrom),
    );

    const entries: AttendanceRuleChangeEntryDTO[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const previous = sorted[i - 1]!;
      const current = sorted[i]!;
      for (const field of ATTENDANCE_RULES_FIELDS) {
        if (previous[field] !== current[field]) {
          entries.push({
            id: `${current.id}:${field}`,
            field,
            previousValue: previous[field],
            newValue: current[field],
            effectiveFrom: current.effectiveFrom,
            changedBy: current.changedBy,
            changedAt: current.createdAt,
          });
        }
      }
    }

    return entries.sort((a, b) => b.changedAt.localeCompare(a.changedAt));
  }
}

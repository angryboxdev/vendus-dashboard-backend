import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type {
  ClearWorkShiftsPreviewDTO,
  PreviewClearWorkShiftsCommand,
  PreviewClearWorkShiftsPort,
} from "../../domain/ports/in/schedule.ports.js";
import { partitionClearTargets } from "./clear-work-shifts.use-case.js";

/**
 * Pré-visualização de "Limpar turnos" — mostra, por colaborador, quantos
 * turnos serão apagados e quantos ficam protegidos (com presença), sem
 * apagar nada. Usa exatamente a mesma seleção da confirmação.
 */
export class PreviewClearWorkShiftsUseCase implements PreviewClearWorkShiftsPort {
  constructor(private readonly workShiftRepository: WorkShiftRepositoryPort) {}

  async execute(command: PreviewClearWorkShiftsCommand): Promise<ClearWorkShiftsPreviewDTO> {
    const { deletable, protectedShifts } = await partitionClearTargets(this.workShiftRepository, command);

    const byEmployee = new Map<string, ClearWorkShiftsPreviewDTO["byEmployee"][number]>();
    const tally = (employeeId: string, workDate: string, field: "deletableCount" | "protectedCount") => {
      const row = byEmployee.get(employeeId) ?? { employeeId, deletableCount: 0, protectedCount: 0, firstDate: workDate, lastDate: workDate };
      row[field]++;
      if (workDate < row.firstDate) row.firstDate = workDate;
      if (workDate > row.lastDate) row.lastDate = workDate;
      byEmployee.set(employeeId, row);
    };
    for (const s of deletable) tally(s.employeeId, s.workDate, "deletableCount");
    for (const s of protectedShifts) tally(s.employeeId, s.workDate, "protectedCount");

    return {
      deletableCount: deletable.length,
      protectedCount: protectedShifts.length,
      byEmployee: [...byEmployee.values()].sort((a, b) => b.deletableCount - a.deletableCount || a.employeeId.localeCompare(b.employeeId)),
    };
  }
}

import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  AttendanceCorrectionDTO,
  AttendanceCorrectionRecord,
  AttendanceCorrectionRepositoryPort,
} from "../../domain/ports/out/attendance-correction-repository.port.js";

export class FakeAttendanceCorrectionRepository implements AttendanceCorrectionRepositoryPort {
  readonly entries: AttendanceCorrectionDTO[] = [];

  async record(entry: AttendanceCorrectionRecord): Promise<AttendanceCorrectionDTO> {
    const dto: AttendanceCorrectionDTO = {
      id: randomUUID(),
      workShiftId: entry.workShiftId,
      employeeId: entry.employeeId,
      workDate: entry.workDate,
      correctionType: entry.correctionType,
      original: entry.original,
      corrected: entry.corrected,
      reason: entry.reason,
      notes: entry.notes,
      actor: entry.actor,
      createdAt: new Date().toISOString(),
    };
    this.entries.push(dto);
    return dto;
  }

  async findByShiftId(_organizationId: OrganizationId, workShiftId: string): Promise<AttendanceCorrectionDTO[]> {
    return this.entries.filter((e) => e.workShiftId === workShiftId);
  }

  async listInRange(_organizationId: OrganizationId, from: string, to: string): Promise<AttendanceCorrectionDTO[]> {
    return this.entries.filter((e) => e.workDate >= from && e.workDate <= to);
  }
}

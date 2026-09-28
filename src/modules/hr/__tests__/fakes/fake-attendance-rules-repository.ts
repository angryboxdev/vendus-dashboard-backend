import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { AttendanceRulesRepositoryPort } from "../../domain/ports/out/attendance-rules-repository.port.js";
import type { AttendanceRulesVersion } from "../../domain/entities/attendance-rules.js";

export class FakeAttendanceRulesRepository implements AttendanceRulesRepositoryPort {
  readonly versions: AttendanceRulesVersion[] = [];

  seed(version: Partial<AttendanceRulesVersion> & Pick<AttendanceRulesVersion, "effectiveFrom">) {
    this.versions.push({
      id: randomUUID(),
      organizationId: "org-test",
      entryToleranceMinutes: 10,
      earlyExitToleranceMinutes: 5,
      absenceThresholdMinutes: 60,
      preShiftWindowMinutes: 30,
      postShiftWindowMinutes: 60,
      controlStartDate: null,
      changedBy: "seed",
      createdAt: new Date().toISOString(),
      ...version,
    });
  }

  async listVersions(_organizationId: OrganizationId): Promise<AttendanceRulesVersion[]> {
    return [...this.versions];
  }

  async save(_organizationId: OrganizationId, version: AttendanceRulesVersion): Promise<AttendanceRulesVersion> {
    const saved = { ...version, id: version.id || randomUUID() };
    this.versions.push(saved);
    return saved;
  }
}

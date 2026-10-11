import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { EmployeeSegments, SettingProfile, SettingTarget, SettingValue } from "../../domain/entities/setting-profile.js";
import type { EmployeeSegmentsPort, SettingsClockPort, SettingsImpactPort, SettingsRepositoryPort } from "../../domain/ports/out/settings.ports.js";
import type { SettingsSnapshot } from "../../domain/services/setting-resolution.js";

/** Repositório em memória — uma organização só (os testes de isolamento ficam nos de integração). */
export class FakeSettingsRepository implements SettingsRepositoryPort {
  snap: SettingsSnapshot = { profiles: [], targets: [], values: [] };
  private seq = 0;
  private tick = 0;

  private id(prefix: string) {
    this.seq += 1;
    return `${prefix}${String(this.seq).padStart(3, "0")}`;
  }

  async loadSnapshot(): Promise<SettingsSnapshot> {
    return { profiles: [...this.snap.profiles], targets: [...this.snap.targets], values: [...this.snap.values] };
  }
  async createProfile(_org: OrganizationId, input: { domain: SettingProfile["domain"]; name: string; kind: SettingProfile["kind"] }): Promise<SettingProfile> {
    const p: SettingProfile = { id: this.id("p"), domain: input.domain, name: input.name, kind: input.kind, archived: false };
    this.snap.profiles.push(p);
    return p;
  }
  async addTarget(_org: OrganizationId, input: Omit<SettingTarget, "id">): Promise<SettingTarget> {
    const t: SettingTarget = { id: this.id("t"), profileId: input.profileId, targetType: input.targetType, targetId: input.targetId, validFrom: input.validFrom, validTo: input.validTo };
    this.snap.targets.push(t);
    return t;
  }
  async appendValue(_org: OrganizationId, input: Omit<SettingValue, "id" | "createdAt">): Promise<SettingValue> {
    this.tick += 1;
    const v: SettingValue = { ...input, id: this.id("v"), createdAt: `2026-10-11T10:00:${String(this.tick).padStart(2, "0")}Z` };
    this.snap.values.push(v);
    return v;
  }
}

export class FakeSegments implements EmployeeSegmentsPort {
  constructor(public byEmployee: Record<string, Omit<EmployeeSegments, "employeeId">> = {}) {}
  async segmentsOf(_org: OrganizationId, employeeId: string): Promise<EmployeeSegments> {
    const s = this.byEmployee[employeeId] ?? { locationIds: [], departmentIds: [], groupIds: [] };
    return { employeeId, ...s };
  }
}

export class FakeImpact implements SettingsImpactPort {
  calls: unknown[] = [];
  constructor(private readonly n = 7) {}
  async countEmployees(_org: OrganizationId, scope: unknown): Promise<number> {
    this.calls.push(scope);
    return this.n;
  }
}

export class FakeClock implements SettingsClockPort {
  constructor(public date = "2026-10-11") {}
  async today(): Promise<string> {
    return this.date;
  }
}

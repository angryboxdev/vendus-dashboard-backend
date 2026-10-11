import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { SettingDefinition, SettingDomain } from "../../domain/entities/setting-definition.js";
import type { SettingProfile, SettingTarget, TargetType } from "../../domain/entities/setting-profile.js";
import { RetroactiveNotAllowed, SettingNotFound, SettingValidationError } from "../../domain/errors.js";
import type { Actor, HistoryEntry, ImpactPreview, ProfileDetail, SettingsPorts } from "../../domain/ports/in/settings.ports.js";
import type { EmployeeSegmentsPort, SettingsAuditPort, SettingsClockPort, SettingsImpactPort, SettingsNotifierPort, SettingsRepositoryPort } from "../../domain/ports/out/settings.ports.js";
import { activeOn, profileValueAt, profileViewAt, resolveSetting, type SettingsSnapshot } from "../../domain/services/setting-resolution.js";
import { checkDependencies, validateSettingValue } from "../../domain/services/setting-validation.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DOMAINS: SettingDomain[] = ["security", "time_tracking", "notifications"];
const TARGETS_BY_KIND: Record<SettingProfile["kind"], TargetType[]> = {
  global: [],
  segment: ["group", "department", "location"],
  personal: ["employee"],
};

function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
}

/** Versão opaca de um perfil (ETag): muda com cada valor ou alvo novo. */
export function profileVersion(profileId: string, snap: SettingsSnapshot): string {
  const values = snap.values.filter((v) => v.profileId === profileId);
  const targets = snap.targets.filter((t) => t.profileId === profileId);
  const last = [...values.map((v) => v.createdAt)].sort().at(-1) ?? "-";
  return `${profileId}:${values.length}:${targets.length}:${last}`;
}

export class SettingsUseCases implements SettingsPorts {
  constructor(
    private readonly repo: SettingsRepositoryPort,
    private readonly segments: EmployeeSegmentsPort,
    private readonly impact: SettingsImpactPort,
    private readonly clock: SettingsClockPort,
    private readonly catalog: SettingDefinition[],
    private readonly audit: SettingsAuditPort,
    private readonly notifier: SettingsNotifierPort = { retroactiveChange: async () => undefined },
  ) {}

  listDefinitions(domain?: SettingDomain): SettingDefinition[] {
    return domain ? this.catalog.filter((d) => d.domain === domain) : this.catalog;
  }

  async listProfiles(orgId: OrganizationId): Promise<SettingProfile[]> {
    const snap = await this.repo.loadSnapshot(orgId);
    return snap.profiles;
  }

  async getProfile(orgId: OrganizationId, profileId: string): Promise<ProfileDetail> {
    const snap = await this.repo.loadSnapshot(orgId);
    const profile = this.findProfile(snap, profileId);
    const today = await this.clock.today(orgId);
    const keys = [...new Set(snap.values.filter((v) => v.profileId === profileId).map((v) => v.key))];
    const values = keys.map((k) => profileValueAt(snap.values, profileId, k, today)).filter((v): v is NonNullable<typeof v> => !!v);
    return { profile, targets: snap.targets.filter((t) => t.profileId === profileId), values, version: profileVersion(profileId, snap) };
  }

  async createProfile(orgId: OrganizationId, input: { domain: SettingDomain; name: string; kind: SettingProfile["kind"] }, actor: Actor): Promise<SettingProfile> {
    const name = input.name.trim();
    if (!DOMAINS.includes(input.domain)) throw new SettingValidationError("Domínio desconhecido.", "domain");
    if (!["global", "segment", "personal"].includes(input.kind)) throw new SettingValidationError("Tipo de perfil inválido.", "kind");
    if (!name || name.length > 120) throw new SettingValidationError("O nome é obrigatório (máx. 120).", "name");
    const snap = await this.repo.loadSnapshot(orgId);
    const sameDomain = snap.profiles.filter((p) => p.domain === input.domain && !p.archived);
    if (sameDomain.some((p) => p.name.toLocaleLowerCase("pt") === name.toLocaleLowerCase("pt"))) {
      throw new SettingValidationError("Já existe um perfil com este nome neste domínio.", "name");
    }
    if (input.kind === "global" && sameDomain.some((p) => p.kind === "global")) {
      throw new SettingValidationError("Este domínio já tem uma configuração global.", "kind");
    }
    const profile = await this.repo.createProfile(orgId, { domain: input.domain, name, kind: input.kind, createdBy: actor.userId });
    await this.audit.record(orgId, { actor: actor.userId, action: "settings.profile.create", resourceType: "setting_profile", resourceId: profile.id, before: null, after: profile, reason: null });
    return profile;
  }

  async addTarget(
    orgId: OrganizationId,
    profileId: string,
    input: { targetType: TargetType; targetId: string; validFrom: string; validTo: string | null },
    actor: Actor,
  ): Promise<SettingTarget> {
    const snap = await this.repo.loadSnapshot(orgId);
    const profile = this.findProfile(snap, profileId);
    if (!TARGETS_BY_KIND[profile.kind].includes(input.targetType)) {
      throw new SettingValidationError(
        profile.kind === "global" ? "A configuração global aplica-se a todos; não tem alvos." : "Este tipo de alvo não serve para este perfil.",
        "targetType",
      );
    }
    if (!input.targetId) throw new SettingValidationError("Falta o alvo.", "targetId");
    if (!DATE.test(input.validFrom) || (input.validTo !== null && (!DATE.test(input.validTo) || input.validTo < input.validFrom))) {
      throw new SettingValidationError("Vigência inválida.", "validFrom");
    }
    // Um alvo com início no passado também muda a configuração de dias passados.
    if (input.validFrom < (await this.clock.today(orgId)) && !actor.canRetroactive) throw new RetroactiveNotAllowed(input.validFrom);
    const overlaps = snap.targets.some(
      (t) =>
        t.profileId === profileId &&
        t.targetType === input.targetType &&
        t.targetId === input.targetId &&
        (t.validTo === null || input.validFrom <= t.validTo) &&
        (input.validTo === null || t.validFrom <= input.validTo),
    );
    if (overlaps) throw new SettingValidationError("Este alvo já está associado ao perfil nesse período.", "targetId");
    const target = await this.repo.addTarget(orgId, { profileId, ...input, createdBy: actor.userId });
    await this.audit.record(orgId, { actor: actor.userId, action: "settings.target.add", resourceType: "setting_profile", resourceId: profileId, before: null, after: target, reason: null });
    return target;
  }

  async setValue(
    orgId: OrganizationId,
    profileId: string,
    input: { key: string; value: SettingDefinition["defaultValue"] | null; validFrom: string; reason: string },
    actor: Actor,
  ) {
    const def = this.catalog.find((d) => d.key === input.key);
    if (!def) throw new SettingNotFound("Parâmetro desconhecido.");
    const snap = await this.repo.loadSnapshot(orgId);
    const profile = this.findProfile(snap, profileId);
    if (profile.archived) throw new SettingValidationError("Perfil arquivado.", "profileId");
    if (profile.domain !== def.domain) throw new SettingValidationError("Este parâmetro não pertence ao domínio do perfil.", def.key);
    const reason = input.reason.trim();
    if (!reason) throw new SettingValidationError("O motivo é obrigatório.", "reason");
    if (!DATE.test(input.validFrom)) throw new SettingValidationError("Data de efeito inválida.", "validFrom");
    validateSettingValue(def, input.value);

    const today = await this.clock.today(orgId);
    const retroactive = input.validFrom < today;
    if (retroactive && !actor.canRetroactive) throw new RetroactiveNotAllowed(input.validFrom);

    if (input.value !== null) checkDependencies(this.catalog, def.key, input.value, profileViewAt(this.catalog, profile, input.validFrom, snap));

    const impact = retroactive ? await this.computeImpact(orgId, profile, snap, input.validFrom, today) : null;
    const previous = profileValueAt(snap.values, profileId, def.key, input.validFrom);
    const value = await this.repo.appendValue(orgId, {
      profileId,
      key: def.key,
      value: input.value,
      validFrom: input.validFrom,
      createdBy: actor.userId,
      reason,
    });
    await this.audit.record(orgId, {
      actor: actor.userId,
      action: retroactive ? "settings.value.set_retroactive" : "settings.value.set",
      resourceType: "setting_profile",
      resourceId: profileId,
      before: { key: def.key, value: previous?.value ?? null, validFrom: previous?.validFrom ?? null },
      after: { key: def.key, value: value.value, validFrom: value.validFrom, ...(impact && { impact }) },
      reason,
    });
    if (impact) {
      await this.notifier.retroactiveChange(orgId, {
        valueId: value.id,
        label: def.label,
        profileName: profile.name,
        validFrom: value.validFrom,
        employees: impact.employees,
        pastDays: impact.pastDays,
        actor: actor.userId,
      });
    }
    return { value, impact };
  }

  async impactPreview(orgId: OrganizationId, profileId: string, validFrom: string): Promise<ImpactPreview> {
    if (!DATE.test(validFrom)) throw new SettingValidationError("Data de efeito inválida.", "validFrom");
    const snap = await this.repo.loadSnapshot(orgId);
    return this.computeImpact(orgId, this.findProfile(snap, profileId), snap, validFrom, await this.clock.today(orgId));
  }

  async effectiveFor(orgId: OrganizationId, employeeId: string, date: string, domain?: SettingDomain) {
    if (!DATE.test(date)) throw new SettingValidationError("Data inválida.", "date");
    const [snap, segments] = await Promise.all([this.repo.loadSnapshot(orgId), this.segments.segmentsOf(orgId, employeeId, date)]);
    return this.listDefinitions(domain).map((def) => resolveSetting(def, segments, date, snap));
  }

  async history(orgId: OrganizationId, filter: { key?: string; profileId?: string }): Promise<HistoryEntry[]> {
    const snap = await this.repo.loadSnapshot(orgId);
    const names = new Map(snap.profiles.map((p) => [p.id, p.name]));
    const labels = new Map(this.catalog.map((d) => [d.key, d.label]));
    const rows = snap.values
      .filter((v) => (!filter.key || v.key === filter.key) && (!filter.profileId || v.profileId === filter.profileId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    return rows
      .map((v, i) => {
        const prior = rows.slice(0, i).filter((p) => p.profileId === v.profileId && p.key === v.key && p.validFrom <= v.validFrom).at(-1);
        return {
          valueId: v.id,
          profileId: v.profileId,
          profileName: names.get(v.profileId) ?? "",
          key: v.key,
          label: labels.get(v.key) ?? v.key,
          before: prior?.value ?? null,
          after: v.value,
          validFrom: v.validFrom,
          createdAt: v.createdAt,
          createdBy: v.createdBy,
          reason: v.reason,
        };
      })
      .reverse();
  }

  async sessionPolicy(orgId: OrganizationId) {
    const def = this.catalog.find((d) => d.key === "security.session.inactivity_minutes");
    if (!def) return { inactivityMinutes: 30 };
    const [snap, today] = await Promise.all([this.repo.loadSnapshot(orgId), this.clock.today(orgId)]);
    // Sem colaborador: vale a configuração da empresa (global) ou a predefinição.
    const s = resolveSetting(def, { employeeId: "", locationIds: [], departmentIds: [], groupIds: [] }, today, snap);
    return { inactivityMinutes: Number(s.value) };
  }

  private findProfile(snap: SettingsSnapshot, profileId: string): SettingProfile {
    const p = snap.profiles.find((x) => x.id === profileId);
    if (!p) throw new SettingNotFound("Perfil não encontrado.");
    return p;
  }

  private async computeImpact(orgId: OrganizationId, profile: SettingProfile, snap: SettingsSnapshot, validFrom: string, today: string): Promise<ImpactPreview> {
    const date = validFrom > today ? validFrom : today;
    const targets = snap.targets.filter((t) => t.profileId === profile.id && (activeOn(t, date) || activeOn(t, validFrom)));
    const employees =
      profile.kind === "global"
        ? await this.impact.countEmployees(orgId, { allEmployees: true }, date)
        : await this.impact.countEmployees(orgId, { targets: targets.map((t) => ({ targetType: t.targetType, targetId: t.targetId })) }, date);
    return { employees, pastDays: daysBetween(validFrom, today), validFrom };
  }
}

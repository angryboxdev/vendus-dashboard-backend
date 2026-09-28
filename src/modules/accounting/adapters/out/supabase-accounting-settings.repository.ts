import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { AccountingSettingsDTO, AccountingSettingsRepositoryPort } from "../../domain/ports/out/accounting-settings-repository.port.js";
import type { VatPeriodicity } from "../../domain/services/vat-period.service.js";

const DEFAULT_SETTINGS: AccountingSettingsDTO = { vatPeriodicity: "quarterly" };

/** 1 linha por organização; ausência de linha = "quarterly" por omissão. */
export class SupabaseAccountingSettingsRepository implements AccountingSettingsRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async get(organizationId: OrganizationId): Promise<AccountingSettingsDTO> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("accounting_settings")
      .select("vat_periodicity")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return DEFAULT_SETTINGS;
    return { vatPeriodicity: (data as unknown as { vat_periodicity: string }).vat_periodicity as VatPeriodicity };
  }

  async save(organizationId: OrganizationId, settings: AccountingSettingsDTO): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("accounting_settings")
      .upsert({ vat_periodicity: settings.vatPeriodicity, updated_at: new Date().toISOString() }, { onConflict: "org_id" });
    if (error) throw new Error(error.message);
  }
}

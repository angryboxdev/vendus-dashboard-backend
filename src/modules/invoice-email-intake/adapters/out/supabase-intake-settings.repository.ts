import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { IntakeDestination } from "../../domain/entities/inbound-attachment.js";
import type { IntakeSettingsRepositoryPort } from "../../domain/ports/out/email-intake.out-ports.js";

/** Sem linha = Faturas (Financeiro), a predefinição. */
export class SupabaseIntakeSettingsRepository implements IntakeSettingsRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async getDestination(organizationId: OrganizationId): Promise<IntakeDestination> {
    const { data, error } = await this.scopedQuery(organizationId).table("invoice_email_intake_settings").select("destination").maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { destination?: string } | null)?.destination === "stock" ? "stock" : "finance";
  }

  async setDestination(organizationId: OrganizationId, destination: IntakeDestination, actor: string): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("invoice_email_intake_settings")
      .upsert({ destination, updated_by: actor, updated_at: new Date().toISOString() }, { onConflict: "org_id" });
    if (error) throw new Error(error.message);
  }
}

import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { Bank, type BankLogoKey, type StatementFormat } from "../../domain/entities/bank.js";
import type { BankRepositoryPort } from "../../domain/ports/out/bank-repository.port.js";

function toEntity(row: Record<string, unknown>): Bank {
  return Bank.reconstitute({
    id: row["id"] as string,
    name: row["name"] as string,
    logoKey: row["logo_key"] as BankLogoKey,
    color: row["color"] as string,
    country: row["country"] as string,
    bic: (row["bic"] as string | null) ?? null,
    statementFormat: row["statement_format"] as StatementFormat,
    createdAt: new Date(row["created_at"] as string),
    updatedAt: new Date(row["updated_at"] as string),
  });
}

/**
 * Never holds a `SupabaseClient` — receives the scoped-query factory at
 * composition time (D2) and builds a scoped helper per call, per the
 * pattern this module establishes (see the module README's Ports section).
 */
export class SupabaseBankRepository implements BankRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async save(organizationId: OrganizationId, bank: Bank): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("banks").insert({
      id: bank.id,
      name: bank.name,
      logo_key: bank.logoKey,
      color: bank.color,
      country: bank.country,
      bic: bank.bic,
      statement_format: bank.statementFormat,
      created_at: bank.createdAt.toISOString(),
      updated_at: bank.updatedAt.toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<Bank | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("banks")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as unknown as Record<string, unknown>);
  }

  async findAll(organizationId: OrganizationId): Promise<Bank[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("banks")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => toEntity(r));
  }

  async update(organizationId: OrganizationId, bank: Bank): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("banks")
      .update({
        name: bank.name,
        logo_key: bank.logoKey,
        color: bank.color,
        country: bank.country,
        bic: bank.bic,
        statement_format: bank.statementFormat,
        updated_at: bank.updatedAt.toISOString(),
      })
      .eq("id", bank.id);
    if (error) throw new Error(error.message);
  }

  async delete(organizationId: OrganizationId, id: string): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("banks").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
}

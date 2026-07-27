import type { SupabaseClient } from "@supabase/supabase-js";
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

export class SupabaseBankRepository implements BankRepositoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async save(bank: Bank): Promise<void> {
    const { error } = await this.supabase.from("banks").insert({
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

  async findById(id: string): Promise<Bank | null> {
    const { data, error } = await this.supabase
      .from("banks")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as Record<string, unknown>);
  }

  async findAll(): Promise<Bank[]> {
    const { data, error } = await this.supabase
      .from("banks")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toEntity(r as Record<string, unknown>));
  }

  async update(bank: Bank): Promise<void> {
    const { error } = await this.supabase
      .from("banks")
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

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.from("banks").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

}

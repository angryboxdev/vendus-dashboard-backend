import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BankAccount,
  type BankAccountType,
  type CheckingAccountType,
} from "../../domain/entities/bank-account.js";
import type { BankAccountRepositoryPort } from "../../domain/ports/out/bank-account-repository.port.js";

function toEntity(row: Record<string, unknown>): BankAccount {
  return BankAccount.reconstitute({
    id: row["id"] as string,
    bankId: row["bank_id"] as string,
    type: row["type"] as BankAccountType,
    nickname: (row["nickname"] as string | null) ?? null,
    iban: (row["iban"] as string | null) ?? null,
    accountNumber: (row["account_number"] as string | null) ?? null,
    accountType: (row["account_type"] as CheckingAccountType | null) ?? null,
    lastFourDigits: (row["last_four_digits"] as string | null) ?? null,
    cardName: (row["card_name"] as string | null) ?? null,
    creditLimitCents: (row["credit_limit_cents"] as number | null) ?? null,
    billingCycleDay: (row["billing_cycle_day"] as number | null) ?? null,
    isActive: row["is_active"] as boolean,
    createdAt: new Date(row["created_at"] as string),
    updatedAt: new Date(row["updated_at"] as string),
  });
}

export class SupabaseBankAccountRepository implements BankAccountRepositoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async save(account: BankAccount): Promise<void> {
    const { error } = await this.supabase.from("bank_accounts").insert({
      id: account.id,
      bank_id: account.bankId,
      type: account.type,
      nickname: account.nickname,
      iban: account.iban,
      account_number: account.accountNumber,
      account_type: account.accountType,
      last_four_digits: account.lastFourDigits,
      card_name: account.cardName,
      credit_limit_cents: account.creditLimitCents,
      billing_cycle_day: account.billingCycleDay,
      is_active: account.isActive,
      created_at: account.createdAt.toISOString(),
      updated_at: account.updatedAt.toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  async findById(id: string): Promise<BankAccount | null> {
    const { data, error } = await this.supabase
      .from("bank_accounts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as Record<string, unknown>);
  }

  async findByBankId(bankId: string): Promise<BankAccount[]> {
    const { data, error } = await this.supabase
      .from("bank_accounts")
      .select("*")
      .eq("bank_id", bankId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toEntity(r as Record<string, unknown>));
  }

  async findByAccountNumber(raw: string): Promise<BankAccount | null> {
    const normalised = raw.trim().replace(/\s+/g, "").toUpperCase();
    // Try IBAN first, then account_number — case-insensitive via ilike
    const { data, error } = await this.supabase
      .from("bank_accounts")
      .select("*")
      .or(`iban.ilike.${normalised},account_number.ilike.${normalised}`)
      .eq("is_active", true)
      .limit(1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return null;
    const account = toEntity(data[0] as Record<string, unknown>);
    // Double-check with the domain logic (handles whitespace in stored values)
    return account.matchesAccountNumber(raw) ? account : null;
  }

  async update(account: BankAccount): Promise<void> {
    const { error } = await this.supabase
      .from("bank_accounts")
      .update({
        nickname: account.nickname,
        iban: account.iban,
        account_number: account.accountNumber,
        account_type: account.accountType,
        last_four_digits: account.lastFourDigits,
        card_name: account.cardName,
        credit_limit_cents: account.creditLimitCents,
        billing_cycle_day: account.billingCycleDay,
        is_active: account.isActive,
        updated_at: account.updatedAt.toISOString(),
      })
      .eq("id", account.id);
    if (error) throw new Error(error.message);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.from("bank_accounts").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async countStatements(accountId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("bank_statement_imports")
      .select("id", { count: "exact", head: true })
      .eq("bank_account_id", accountId);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }
}

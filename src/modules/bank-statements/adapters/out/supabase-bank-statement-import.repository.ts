import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BankStatementImport,
  type StatementStatus,
  type StatementSourceType,
} from "../../domain/entities/bank-statement-import.js";
import type {
  BankStatementImportFilter,
  BankStatementImportRepositoryPort,
} from "../../domain/ports/out/bank-statement-import-repository.port.js";

function toEntity(row: Record<string, unknown>): BankStatementImport {
  return BankStatementImport.reconstitute({
    id: row.id as string,
    bankAccountId: (row.bank_account_id as string | null) ?? null,
    bankName: row.bank_name as string,
    accountNumber: row.account_number as string,
    periodStart: new Date(row.period_start as string),
    periodEnd: new Date(row.period_end as string),
    currency: row.currency as string,
    sourceType: row.source_type as StatementSourceType,
    sourceFileName: (row.source_file_name as string | null) ?? null,
    importedMovementsCount: row.imported_movements_count as number,
    openingBalance: row.opening_balance as number,
    closingBalance: row.closing_balance as number,
    calculatedClosingBalance: row.calculated_closing_balance as number,
    balanceDifference: row.balance_difference as number,
    reconciliationProgress: row.reconciliation_progress as number,
    status: row.status as StatementStatus,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });
}

export class SupabaseBankStatementImportRepository
  implements BankStatementImportRepositoryPort
{
  constructor(private readonly supabase: SupabaseClient) {}

  async save(statement: BankStatementImport): Promise<void> {
    const { error } = await this.supabase.from("bank_statement_imports").insert({
      id: statement.id,
      bank_account_id: statement.bankAccountId,
      bank_name: statement.bankName,
      account_number: statement.accountNumber,
      period_start: statement.periodStart.toISOString().slice(0, 10),
      period_end: statement.periodEnd.toISOString().slice(0, 10),
      currency: statement.currency,
      source_type: statement.sourceType,
      source_file_name: statement.sourceFileName,
      imported_movements_count: statement.importedMovementsCount,
      opening_balance: statement.openingBalance,
      closing_balance: statement.closingBalance,
      calculated_closing_balance: statement.calculatedClosingBalance,
      balance_difference: statement.balanceDifference,
      reconciliation_progress: statement.reconciliationProgress,
      status: statement.status,
      created_at: statement.createdAt.toISOString(),
      updated_at: statement.updatedAt.toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  async findById(id: string): Promise<BankStatementImport | null> {
    const { data, error } = await this.supabase
      .from("bank_statement_imports")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as Record<string, unknown>);
  }

  async findAll(filter?: BankStatementImportFilter): Promise<BankStatementImport[]> {
    let q = this.supabase
      .from("bank_statement_imports")
      .select("*")
      .order("period_start", { ascending: false });

    if (filter?.accountNumber) q = q.eq("account_number", filter.accountNumber);
    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.from) q = q.gte("period_start", filter.from.toISOString().slice(0, 10));
    if (filter?.to) q = q.lte("period_end", filter.to.toISOString().slice(0, 10));

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toEntity(r as Record<string, unknown>));
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("bank_statement_imports")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async update(statement: BankStatementImport): Promise<void> {
    const { error } = await this.supabase
      .from("bank_statement_imports")
      .update({
        bank_account_id: statement.bankAccountId,
        bank_name: statement.bankName,
        account_number: statement.accountNumber,
        period_start: statement.periodStart.toISOString().slice(0, 10),
        period_end: statement.periodEnd.toISOString().slice(0, 10),
        opening_balance: statement.openingBalance,
        closing_balance: statement.closingBalance,
        imported_movements_count: statement.importedMovementsCount,
        calculated_closing_balance: statement.calculatedClosingBalance,
        balance_difference: statement.balanceDifference,
        reconciliation_progress: statement.reconciliationProgress,
        status: statement.status,
        updated_at: statement.updatedAt.toISOString(),
      })
      .eq("id", statement.id);
    if (error) throw new Error(error.message);
  }
}

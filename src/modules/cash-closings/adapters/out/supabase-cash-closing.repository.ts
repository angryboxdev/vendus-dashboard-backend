import type { SupabaseClient } from "@supabase/supabase-js";
import { CashClosing, type CashClosingStatus, type DrawerDenominations } from "../../domain/entities/cash-closing.js";
import type {
  CashClosingRepositoryPort,
  ClosingListFilter,
} from "../../domain/ports/out/cash-closing-repository.port.js";

function toEntity(row: Record<string, unknown>): CashClosing {
  return CashClosing.reconstitute({
    id: row.id as string,
    closingDate: row.closing_date as string,
    employeeId: row.employee_id as string,
    employeeName:
      (row.hr_employees as { full_name?: string } | null)?.full_name ?? "",
    tpa: Number(row.tpa),
    uber: Number(row.uber),
    glovo: Number(row.glovo),
    bolt: Number(row.bolt),
    eatz: Number(row.eatz),
    cashSales: Number(row.cash_sales),
    cashIn: Number(row.cash_in),
    cashOut: Number(row.cash_out),
    cashDrawerOpen: Number(row.cash_drawer_open),
    cashDrawerTotal: Number(row.cash_drawer_total),
    totalCalculated: Number(row.total_calculated),
    vendusTotal: row.vendus_total != null ? Number(row.vendus_total) : null,
    sangriaAmount: Number(row.sangria_amount),
    notes: (row.notes as string | null) ?? null,
    status: row.status as CashClosingStatus,
    managerNotes: (row.manager_notes as string | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    submittedAt: row.submitted_at as string,
    sessionOpenedAt: (row.session_opened_at as string | null) ?? null,
    drawerDenominations: (row.drawer_denominations as DrawerDenominations | null) ?? null,
    airMenuUber: row.air_menu_uber != null ? Number(row.air_menu_uber) : null,
    airMenuGlovo: row.air_menu_glovo != null ? Number(row.air_menu_glovo) : null,
    airMenuBolt: row.air_menu_bolt != null ? Number(row.air_menu_bolt) : null,
  });
}

export class SupabaseCashClosingRepository implements CashClosingRepositoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async save(closing: CashClosing): Promise<void> {
    const { error } = await this.supabase.from("cash_closings").insert({
      id: closing.id,
      closing_date: closing.closingDate,
      employee_id: closing.employeeId,
      tpa: closing.tpa,
      uber: closing.uber,
      glovo: closing.glovo,
      bolt: closing.bolt,
      eatz: closing.eatz,
      cash_sales: closing.cashSales,
      cash_in: closing.cashIn,
      cash_out: closing.cashOut,
      cash_drawer_open: closing.cashDrawerOpen,
      cash_drawer_total: closing.cashDrawerTotal,
      total_calculated: closing.totalCalculated,
      vendus_total: closing.vendusTotal,
      sangria_amount: closing.sangriaAmount,
      notes: closing.notes,
      status: closing.status,
      submitted_at: closing.submittedAt,
      session_opened_at: closing.sessionOpenedAt,
      drawer_denominations: closing.drawerDenominations,
      air_menu_uber: closing.airMenuUber,
      air_menu_glovo: closing.airMenuGlovo,
      air_menu_bolt: closing.airMenuBolt,
    });

    if (error) throw new Error(error.message);
  }

  async findById(id: string): Promise<CashClosing | null> {
    const { data, error } = await this.supabase
      .from("cash_closings")
      .select("*, hr_employees(full_name)")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return toEntity(data as Record<string, unknown>);
  }

  async list(
    filter: ClosingListFilter,
  ): Promise<{ closings: CashClosing[]; total: number }> {
    let q = this.supabase
      .from("cash_closings")
      .select("*, hr_employees(full_name)", { count: "exact" })
      .order("closing_date", { ascending: false })
      .order("submitted_at", { ascending: false });

    if (filter.from) q = q.gte("closing_date", filter.from);
    if (filter.to) q = q.lte("closing_date", filter.to);
    if (filter.status) q = q.eq("status", filter.status);
    if (filter.employeeId) q = q.eq("employee_id", filter.employeeId);
    if (filter.limit != null) q = q.limit(filter.limit);
    if (filter.offset != null) {
      q = q.range(
        filter.offset,
        filter.offset + (filter.limit ?? 50) - 1,
      );
    }

    const { data, error, count } = await q;
    if (error) throw new Error(error.message);

    return {
      closings: (data ?? []).map((r) => toEntity(r as Record<string, unknown>)),
      total: count ?? 0,
    };
  }

  async update(closing: CashClosing): Promise<void> {
    const { error } = await this.supabase
      .from("cash_closings")
      .update({
        tpa: closing.tpa,
        uber: closing.uber,
        glovo: closing.glovo,
        bolt: closing.bolt,
        eatz: closing.eatz,
        cash_sales: closing.cashSales,
        cash_in: closing.cashIn,
        cash_out: closing.cashOut,
        cash_drawer_open: closing.cashDrawerOpen,
        cash_drawer_total: closing.cashDrawerTotal,
        total_calculated: closing.totalCalculated,
        sangria_amount: closing.sangriaAmount,
        notes: closing.notes,
        status: closing.status,
        manager_notes: closing.managerNotes,
        reviewed_at: closing.reviewedAt,
      })
      .eq("id", closing.id);

    if (error) throw new Error(error.message);
  }

  async existsForEmployeeOnDate(
    employeeId: string,
    closingDate: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("cash_closings")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("closing_date", closingDate)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data != null;
  }

  async existsForSession(sessionOpenedAt: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("cash_closings")
      .select("id")
      .eq("session_opened_at", sessionOpenedAt)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data != null;
  }
}

import { ENV } from "../config/env.js";
import { getSupabaseServiceRole, isHrSupabaseConfigured } from "../infra/supabaseClient.js";
import { fetchAllDocuments } from "./documentsService.js";
import { vendusGet } from "../infra/vendusClient.js";
import type { VendusDetailedDocument } from "../domain/types.js";
import { hashPin } from "../utils/kiosk.js";

export type CashClosingStatus = "pending" | "approved" | "rejected";

export type CashClosing = {
  id: string;
  closingDate: string;
  employeeId: string;
  employeeName: string;
  tpa: number;
  uber: number;
  glovo: number;
  bolt: number;
  eatz: number;
  cashSales: number;
  cashIn: number;
  cashOut: number;
  cashDrawerOpen: number;
  cashDrawerTotal: number;
  totalCalculated: number;
  vendusTotal: number | null;
  sangriaAmount: number;
  notes: string | null;
  status: CashClosingStatus;
  managerNotes: string | null;
  reviewedAt: string | null;
  submittedAt: string;
};

export type VerifyPinResult = {
  employeeId: string;
  fullName: string;
};

export type SubmitClosingBody = {
  employeeId: string;
  closingDate: string;
  tpa: number;
  uber: number;
  glovo: number;
  bolt: number;
  eatz: number;
  cashSales: number;
  cashIn: number;
  cashOut: number;
  cashDrawerOpen: number;
  cashDrawerTotal: number;
  notes?: string | null;
};

export type PatchClosingBody = {
  status?: CashClosingStatus;
  managerNotes?: string | null;
  tpa?: number;
  uber?: number;
  glovo?: number;
  bolt?: number;
  eatz?: number;
  cashSales?: number;
  cashIn?: number;
  cashOut?: number;
  cashDrawerOpen?: number;
  cashDrawerTotal?: number;
  notes?: string | null;
};

export type ListClosingsParams = {
  date?: string;
  status?: CashClosingStatus;
  employeeId?: string;
  limit?: number;
  offset?: number;
};

function requireSupabase() {
  if (!isHrSupabaseConfigured()) {
    throw new Error("Supabase não configurado");
  }
  const sb = getSupabaseServiceRole();
  if (!sb) throw new Error("Supabase indisponível");
  return sb;
}

function mapRow(row: Record<string, unknown>): CashClosing {
  return {
    id: row.id as string,
    closingDate: row.closing_date as string,
    employeeId: row.employee_id as string,
    employeeName: (row.hr_employees as { full_name?: string } | null)?.full_name ?? "",
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
  };
}

export async function verifyPin(pin: string): Promise<VerifyPinResult> {
  if (!ENV.HR_KIOSK_HMAC_SECRET) {
    throw new Error("PIN de kiosk não configurado no servidor");
  }
  const pinHash = hashPin(ENV.HR_KIOSK_HMAC_SECRET, pin);
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("hr_employees")
    .select("id, full_name")
    .eq("kiosk_pin_hash", pinHash)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("PIN inválido ou funcionário inativo");

  return {
    employeeId: data.id as string,
    fullName: data.full_name as string,
  };
}

/**
 * Obtém o total de vendas Vendus para um dia.
 * Replica a lógica do monthly-summary: busca FS+NC, identifica quais FS foram
 * anulados por NC (via related_docs) e exclui-os antes de somar.
 */
export async function getVendusTotal(date: string): Promise<number> {
  const { documents } = await fetchAllDocuments(date, date, "FS,FT,NC", 100);

  // Determina os números FS/FT cancelados por notas de crédito
  const ncDocs = documents.filter((d) => (d as { type?: string }).type === "NC");
  const cancelledFsNumbers = new Set<string>();
  for (const nc of ncDocs) {
    const detail = await vendusGet<VendusDetailedDocument>(`/documents/${nc.id}/`);
    for (const related of detail.related_docs ?? []) {
      if (related.type === "FS" || related.type === "FT") cancelledFsNumbers.add(related.number);
    }
  }

  // Soma apenas FS/FT não cancelados
  const fsDocs = documents.filter(
    (d) =>
      ((d as { type?: string }).type === "FS" || (d as { type?: string }).type === "FT") &&
      !cancelledFsNumbers.has(d.number),
  );
  let total = 0;
  for (const doc of fsDocs) {
    const gross = parseFloat(doc.amount_gross ?? "0");
    if (!isNaN(gross)) total += gross;
  }
  return Math.round(total * 100) / 100;
}

export async function submitClosing(body: SubmitClosingBody): Promise<CashClosing> {
  const sb = requireSupabase();

  // Verify employee exists
  const { data: emp, error: empErr } = await sb
    .from("hr_employees")
    .select("id, full_name")
    .eq("id", body.employeeId)
    .eq("status", "active")
    .maybeSingle();
  if (empErr) throw new Error(empErr.message);
  if (!emp) throw new Error("Funcionário não encontrado");

  // Prevent duplicate on same date
  const { data: existing } = await sb
    .from("cash_closings")
    .select("id")
    .eq("employee_id", body.employeeId)
    .eq("closing_date", body.closingDate)
    .maybeSingle();
  if (existing) throw new Error("Já existe um fecho de caixa para este funcionário nesta data");

  const totalCalculated =
    body.tpa + body.uber + body.glovo + body.bolt + body.eatz + body.cashSales;
  const sangriaAmount =
    body.cashDrawerTotal > 100
      ? Math.round((body.cashDrawerTotal - 100) * 100) / 100
      : 0;

  // Fetch Vendus total (best-effort, don't fail if API is down)
  let vendusTotal: number | null = null;
  try {
    vendusTotal = await getVendusTotal(body.closingDate);
  } catch {
    // intentionally silent
  }

  const { data, error } = await sb
    .from("cash_closings")
    .insert({
      closing_date: body.closingDate,
      employee_id: body.employeeId,
      tpa: body.tpa,
      uber: body.uber,
      glovo: body.glovo,
      bolt: body.bolt,
      eatz: body.eatz,
      cash_sales: body.cashSales,
      cash_in: body.cashIn,
      cash_out: body.cashOut,
      cash_drawer_open: body.cashDrawerOpen,
      cash_drawer_total: body.cashDrawerTotal,
      total_calculated: totalCalculated,
      vendus_total: vendusTotal,
      sangria_amount: sangriaAmount,
      notes: body.notes ?? null,
      status: "pending",
    })
    .select("*, hr_employees(full_name)")
    .single();

  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function listClosings(
  params: ListClosingsParams = {},
): Promise<{ closings: CashClosing[]; total: number }> {
  const sb = requireSupabase();
  let q = sb
    .from("cash_closings")
    .select("*, hr_employees(full_name)", { count: "exact" })
    .order("closing_date", { ascending: false })
    .order("submitted_at", { ascending: false });

  if (params.date) q = q.eq("closing_date", params.date);
  if (params.status) q = q.eq("status", params.status);
  if (params.employeeId) q = q.eq("employee_id", params.employeeId);
  if (params.limit != null) q = q.limit(params.limit);
  if (params.offset != null) q = q.range(params.offset, params.offset + (params.limit ?? 50) - 1);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return {
    closings: (data ?? []).map((r) => mapRow(r as Record<string, unknown>)),
    total: count ?? 0,
  };
}

export async function getClosing(id: string): Promise<CashClosing> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("cash_closings")
    .select("*, hr_employees(full_name)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function patchClosing(id: string, body: PatchClosingBody): Promise<CashClosing> {
  const sb = requireSupabase();
  const update: Record<string, unknown> = {};

  if (body.status != null) {
    update.status = body.status;
    update.reviewed_at = new Date().toISOString();
  }
  if ("managerNotes" in body) update.manager_notes = body.managerNotes ?? null;
  if ("notes" in body) update.notes = body.notes ?? null;

  const colMap: Record<string, string> = {
    tpa: "tpa", uber: "uber", glovo: "glovo", bolt: "bolt", eatz: "eatz",
    cashSales: "cash_sales", cashIn: "cash_in", cashOut: "cash_out",
    cashDrawerOpen: "cash_drawer_open", cashDrawerTotal: "cash_drawer_total",
  };
  for (const [field, col] of Object.entries(colMap)) {
    const val = body[field as keyof PatchClosingBody];
    if (val != null) update[col] = val;
  }

  // Recompute totals if any numeric field changed
  const hasNumericChange = Object.keys(colMap).some(
    (f) => body[f as keyof PatchClosingBody] != null,
  );
  if (hasNumericChange) {
    const current = await getClosing(id);
    const tpa = body.tpa ?? current.tpa;
    const uber = body.uber ?? current.uber;
    const glovo = body.glovo ?? current.glovo;
    const bolt = body.bolt ?? current.bolt;
    const eatz = body.eatz ?? current.eatz;
    const cashSales = body.cashSales ?? current.cashSales;
    const cashDrawerTotal = body.cashDrawerTotal ?? current.cashDrawerTotal;
    const cashDrawerOpen = body.cashDrawerOpen ?? current.cashDrawerOpen;
    update.total_calculated = tpa + uber + glovo + bolt + eatz + cashSales;
    update.sangria_amount =
      cashDrawerTotal > 100 ? Math.round((cashDrawerTotal - 100) * 100) / 100 : 0;
  }

  const { data, error } = await sb
    .from("cash_closings")
    .update(update)
    .eq("id", id)
    .select("*, hr_employees(full_name)")
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

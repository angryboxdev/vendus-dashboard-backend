import type {
  HrEmployeePayment,
  PaymentCreateBody,
  PaymentUpdateBody,
} from "../domain/hrTypes.js";
import { getSupabaseServiceRole, isHrSupabaseConfigured } from "../infra/supabaseClient.js";
import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../utils/lisbonDayInstants.js";

type Row = {
  id: string;
  employee_id: string;
  payment_date: string;
  amount: string | number;
  payment_type: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function rowToPayment(row: Row): HrEmployeePayment {
  return {
    id: row.id,
    employeeId: row.employee_id,
    paymentDate: row.payment_date,
    amount: Number(row.amount),
    paymentType: row.payment_type as HrEmployeePayment["paymentType"],
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireHr() {
  if (!isHrSupabaseConfigured()) {
    throw new Error(
      "RH não configurado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  const s = getSupabaseServiceRole();
  if (!s) {
    throw new Error("Supabase service role indisponível");
  }
  return s;
}

export async function listPaymentsForEmployee(
  employeeId: string,
  filters: {
    from?: string;
    to?: string;
    year?: number;
    month?: number;
  },
): Promise<HrEmployeePayment[]> {
  const supabase = requireHr();
  let q = supabase
    .from("hr_employee_payments")
    .select(
      "id, employee_id, payment_date, amount, payment_type, notes, created_at, updated_at",
    )
    .eq("employee_id", employeeId)
    .order("payment_date", { ascending: false });

  if (filters.year != null && filters.month != null) {
    const start = DateTime.fromObject(
      { year: filters.year, month: filters.month, day: 1 },
      { zone: REPORT_TIMEZONE },
    ).startOf("day");
    const end = start.endOf("month");
    q = q
      .gte("payment_date", start.toISODate()!)
      .lte("payment_date", end.toISODate()!);
  } else if (filters.from != null && filters.to != null) {
    q = q.gte("payment_date", filters.from).lte("payment_date", filters.to);
  }

  const { data, error } = await q;
  if (error) {
    throw new Error(`RH pagamentos: ${error.message}`);
  }
  return ((data ?? []) as Row[]).map(rowToPayment);
}

export async function createPayment(
  employeeId: string,
  body: PaymentCreateBody,
): Promise<HrEmployeePayment> {
  const supabase = requireHr();
  const now = new Date().toISOString();
  const insert = {
    employee_id: employeeId,
    payment_date: body.paymentDate,
    amount: body.amount,
    payment_type: body.paymentType,
    notes: body.notes?.trim() || null,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("hr_employee_payments")
    .insert(insert)
    .select(
      "id, employee_id, payment_date, amount, payment_type, notes, created_at, updated_at",
    )
    .single();

  if (error) {
    throw new Error(`RH criar pagamento: ${error.message}`);
  }
  return rowToPayment(data as Row);
}

export async function updatePayment(
  id: string,
  body: PaymentUpdateBody,
): Promise<HrEmployeePayment> {
  const supabase = requireHr();
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.paymentDate !== undefined) patch.payment_date = body.paymentDate;
  if (body.amount !== undefined) patch.amount = body.amount;
  if (body.paymentType !== undefined) patch.payment_type = body.paymentType;
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;

  const { data, error } = await supabase
    .from("hr_employee_payments")
    .update(patch)
    .eq("id", id)
    .select(
      "id, employee_id, payment_date, amount, payment_type, notes, created_at, updated_at",
    )
    .single();

  if (error) {
    throw new Error(`RH atualizar pagamento: ${error.message}`);
  }
  return rowToPayment(data as Row);
}

export async function deletePayment(id: string): Promise<void> {
  const supabase = requireHr();
  const { error } = await supabase
    .from("hr_employee_payments")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(`RH eliminar pagamento: ${error.message}`);
  }
}

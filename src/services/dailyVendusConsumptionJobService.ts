import { getSupabase, isSupabaseConfigured } from "../infra/supabaseClient.js";
import {
  lisbonDayEndUtcIso,
  REPORT_TIMEZONE,
} from "../utils/lisbonDayInstants.js";
import { DateTime } from "luxon";
import { getIngredientConsumption } from "./ingredientConsumptionService.js";

/** Identifica movimentos criados por este job (não misturar com consumos manuais). */
export const CRON_CONSUMPTION_CREATED_BY = "cron-ingredient-consumption";

/** Razão única por dia civil — usada para idempotência (apagar antes de voltar a inserir). */
export function cronVendusConsumptionReason(targetDateYmd: string): string {
  return `CRON_VENDUS:${targetDateYmd}`;
}

export type DailyConsumptionJobResult = {
  target_date: string;
  dry_run: boolean;
  deleted_rows: number;
  movements_inserted: number;
  skipped_zero_consumption: number;
  /** Soma das quantidades absolutas retiradas (base_unit por item). */
  total_quantity_removed: number;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertValidTargetDate(ymd: string): void {
  if (!ISO_DATE.test(ymd)) {
    throw new Error(`target_date inválido (use YYYY-MM-DD): ${ymd}`);
  }
  const dt = DateTime.fromISO(ymd, { zone: REPORT_TIMEZONE });
  if (!dt.isValid) {
    throw new Error(`Data inválida: ${ymd}`);
  }
}

/** Dia civil anterior em Lisboa (YYYY-MM-DD). */
export function getYesterdayLisbonYmd(): string {
  const day = DateTime.now()
    .setZone(REPORT_TIMEZONE)
    .minus({ days: 1 })
    .toISODate();
  if (!day) throw new Error("Não foi possível calcular ontem (Lisboa)");
  return day;
}

/**
 * 1) Remove movimentos de consumo deste cron para o mesmo `target_date` (reexecução segura).
 * 2) Calcula consumo Vendus (pizzas + mapeamento) para `since = until = target_date`.
 * 3) Insere uma linha `stock_movements` por item com quantidade **negativa** (saída).
 *
 * `movement_date` = fim do dia civil em Lisboa (UTC), para alinhar a relatórios por período.
 */
export async function runDailyVendusConsumptionJob(options?: {
  /** Omite = ontem em Lisboa. */
  targetDate?: string;
  dryRun?: boolean;
}): Promise<DailyConsumptionJobResult> {
  const dryRun = options?.dryRun === true;
  const target_date =
    options?.targetDate?.trim() || getYesterdayLisbonYmd();
  assertValidTargetDate(target_date);

  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase não configurado (SUPABASE_URL / SUPABASE_ANON_KEY)"
    );
  }
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cliente Supabase indisponível");

  const reason = cronVendusConsumptionReason(target_date);
  let deleted_rows = 0;

  if (!dryRun) {
    const { data: removed, error: delErr } = await supabase
      .from("stock_movements")
      .delete()
      .eq("type", "consumption")
      .eq("created_by", CRON_CONSUMPTION_CREATED_BY)
      .eq("reason", reason)
      .select("id");

    if (delErr) {
      throw new Error(`Apagar consumos cron anteriores: ${delErr.message}`);
    }
    deleted_rows = removed?.length ?? 0;
  }

  const report = await getIngredientConsumption(target_date, target_date);
  const movementDateIso = lisbonDayEndUtcIso(target_date);

  const rows = report.consumption
    .filter((c) => c.quantity_consumed > 0)
    .map((c) => {
      const qty = Math.round(c.quantity_consumed * 1000) / 1000;
      return {
        item_id: c.stock_item_id,
        type: "consumption" as const,
        quantity: -qty,
        unit_cost_per_base_unit_with_vat: null as number | null,
        unit_cost_per_base_unit_without_vat: null as number | null,
        reason,
        reference: `vendus-sales:${target_date}`,
        created_by: CRON_CONSUMPTION_CREATED_BY,
        movement_date: movementDateIso,
      };
    });

  const skipped_zero_consumption = report.consumption.filter(
    (c) => c.quantity_consumed <= 0
  ).length;

  const total_quantity_removed = rows.reduce(
    (s, r) => s + Math.abs(r.quantity),
    0
  );

  if (dryRun) {
    return {
      target_date,
      dry_run: true,
      deleted_rows: 0,
      movements_inserted: 0,
      skipped_zero_consumption,
      total_quantity_removed,
    };
  }

  if (rows.length === 0) {
    return {
      target_date,
      dry_run: false,
      deleted_rows,
      movements_inserted: 0,
      skipped_zero_consumption,
      total_quantity_removed: 0,
    };
  }

  const { error: insErr } = await supabase
    .from("stock_movements")
    .insert(rows);

  if (insErr) {
    throw new Error(`Inserir movimentos de consumo: ${insErr.message}`);
  }

  return {
    target_date,
    dry_run: false,
    deleted_rows,
    movements_inserted: rows.length,
    skipped_zero_consumption,
    total_quantity_removed,
  };
}

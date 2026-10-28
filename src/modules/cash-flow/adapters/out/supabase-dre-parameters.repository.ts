import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { DreParameters } from "../../domain/entities/dre-parameters.js";
import type { DreParametersRepositoryPort } from "../../domain/ports/out/dre-parameters-repository.port.js";

const COLUMNS =
  "year, month, delivery_sales_vat_pct, platform_commission_pct, platform_commission_vat_pct, commission_on_gross, " +
  "marketing_vat_pct, card_fee_pct, expense_default_vat_pct, marketing_uber_eats_cents, marketing_glovo_cents, marketing_bolt_food_cents, loan_expense_cents";

interface Row {
  year: number;
  month: number;
  delivery_sales_vat_pct: number | string;
  platform_commission_pct: number | string;
  platform_commission_vat_pct: number | string;
  commission_on_gross: boolean;
  marketing_vat_pct: number | string;
  card_fee_pct: number | string;
  expense_default_vat_pct: number | string;
  marketing_uber_eats_cents: number | string;
  marketing_glovo_cents: number | string;
  marketing_bolt_food_cents: number | string;
  loan_expense_cents: number | string | null;
}

function toDomain(r: Row): DreParameters {
  return {
    deliverySalesVatPct: Number(r.delivery_sales_vat_pct),
    platformCommissionPct: Number(r.platform_commission_pct),
    platformCommissionVatPct: Number(r.platform_commission_vat_pct),
    commissionOnGross: r.commission_on_gross,
    marketingVatPct: Number(r.marketing_vat_pct),
    cardFeePct: Number(r.card_fee_pct),
    expenseDefaultVatPct: Number(r.expense_default_vat_pct),
    marketingNetCents: {
      uber_eats: Number(r.marketing_uber_eats_cents),
      glovo: Number(r.marketing_glovo_cents),
      bolt_food: Number(r.marketing_bolt_food_cents),
    },
    loanExpenseCents: Number(r.loan_expense_cents ?? 0),
  };
}

/** Parâmetros mensais da DRE (`dre_monthly_parameters`, uma linha por empresa e mês). */
export class SupabaseDreParametersRepository implements DreParametersRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async forMonth(organizationId: OrganizationId, year: number, month: number): Promise<{ own: DreParameters | null; previous: DreParameters | null }> {
    // Meses até ao pedido, do mais recente para o mais antigo: o primeiro é o próprio ou o anterior.
    const { data, error } = await this.scopedQuery(organizationId)
      .table("dre_monthly_parameters")
      .select(COLUMNS)
      .or(`year.lt.${year},and(year.eq.${year},month.lte.${month})`)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(2);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Row[];
    const own = rows.find((r) => r.year === year && r.month === month) ?? null;
    const previous = rows.find((r) => !(r.year === year && r.month === month)) ?? null;
    return { own: own ? toDomain(own) : null, previous: previous ? toDomain(previous) : null };
  }

  async save(organizationId: OrganizationId, year: number, month: number, p: DreParameters, updatedBy: string | null): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("dre_monthly_parameters")
      .upsert(
        {
          year,
          month,
          delivery_sales_vat_pct: p.deliverySalesVatPct,
          platform_commission_pct: p.platformCommissionPct,
          platform_commission_vat_pct: p.platformCommissionVatPct,
          commission_on_gross: p.commissionOnGross,
          marketing_vat_pct: p.marketingVatPct,
          card_fee_pct: p.cardFeePct,
          expense_default_vat_pct: p.expenseDefaultVatPct,
          marketing_uber_eats_cents: p.marketingNetCents.uber_eats,
          marketing_glovo_cents: p.marketingNetCents.glovo,
          marketing_bolt_food_cents: p.marketingNetCents.bolt_food,
          loan_expense_cents: p.loanExpenseCents ?? 0,
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id,year,month" },
      );
    if (error) throw new Error(error.message);
  }
}

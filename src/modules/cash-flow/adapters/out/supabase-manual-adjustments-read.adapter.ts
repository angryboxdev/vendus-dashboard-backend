import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { ManualAdjustments } from "../../domain/entities/dre.js";
import type { ManualAdjustmentsReadPort } from "../../domain/ports/out/manual-adjustments-read.port.js";

type Row = { valor_sem_iva: number | string | null };
const sumCents = (rows: Row[]) => Math.round(rows.reduce((a, r) => a + Number(r.valor_sem_iva ?? 0), 0) * 100);

/** Custos fixos e variáveis lançados à mão nas páginas antigas do Mapa (só leitura; valores em euros). */
export class SupabaseManualAdjustmentsReadAdapter implements ManualAdjustmentsReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async forMonth(organizationId: OrganizationId, year: number, month: number): Promise<ManualAdjustments> {
    const [fixed, variable] = await Promise.all([
      this.scopedQuery(organizationId).table("dre_custos_fixos").select("valor_sem_iva").eq("year", year).eq("month", month),
      this.scopedQuery(organizationId).table("dre_custos_variaveis").select("valor_sem_iva").eq("year", year).eq("month", month),
    ]);
    if (fixed.error) throw new Error(fixed.error.message);
    if (variable.error) throw new Error(variable.error.message);
    return {
      fixedCents: sumCents((fixed.data ?? []) as unknown as Row[]),
      variableCents: sumCents((variable.data ?? []) as unknown as Row[]),
    };
  }
}

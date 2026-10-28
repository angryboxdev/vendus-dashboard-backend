import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { DescribeMovementPort } from "../../../bank-statements/domain/ports/in/describe-movement.port.js";
import type { PlatformBankCredit } from "../../domain/entities/payout-reconciliation.js";
import type { PlatformBankCreditsReadPort } from "../../domain/ports/out/platform-bank-credits.port.js";

const PAGE_SIZE = 1000;

interface Row {
  id: string;
  booking_date: string;
  amount: number;
  description: string | null;
}

/**
 * Créditos das plataformas em `bank_movements` (só leitura; a tabela é do módulo `bank-statements`). A
 * plataforma vem das regras do próprio `bank-statements` (\`DescribeMovementPort\`, ligado em `server.ts`).
 */
export class SupabasePlatformBankCreditsAdapter implements PlatformBankCreditsReadPort {
  constructor(
    private readonly scopedQuery: ScopedQueryFactory,
    private readonly describeMovement: DescribeMovementPort,
  ) {}

  async credits(organizationId: OrganizationId, from: string, to: string): Promise<PlatformBankCredit[]> {
    const out: PlatformBankCredit[] = [];
    // Paginado: o PostgREST corta em 1000 linhas.
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await this.scopedQuery(organizationId)
        .table("bank_movements")
        .select("id, booking_date, amount, description")
        .eq("movement_type", "credit")
        .gte("booking_date", from)
        .lte("booking_date", to)
        .order("booking_date", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as Row[];
      for (const r of rows) {
        const platform = this.describeMovement.describe(r.description ?? "", "credit").platform;
        if (platform) out.push({ id: r.id, platform, date: r.booking_date.slice(0, 10), amountCents: Math.abs(Number(r.amount)) });
      }
      if (rows.length < PAGE_SIZE) return out;
    }
  }

  async lastBookingDate(organizationId: OrganizationId): Promise<string | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("bank_movements")
      .select("booking_date")
      .order("booking_date", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as { booking_date: string }[];
    return rows[0] ? rows[0].booking_date.slice(0, 10) : null;
  }
}

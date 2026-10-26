import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { BankDebitLink } from "../../domain/entities/cash-flow.js";
import type {
  BankMovementReadPort,
  StoredBankCredit,
  StoredBankDebit,
} from "../../domain/ports/out/bank-movement-read.port.js";

const PAGE_SIZE = 1000;
const IN_CHUNK = 200;
const COLUMNS =
  "id, booking_date, amount, description, reconciliation_status, justification_type, matched_entity_type, matched_entity_id, cost_center_group_id, cost_center_category_id";

interface MovementRow {
  id: string;
  booking_date: string;
  amount: number;
  description: string;
  reconciliation_status: string;
  justification_type: string | null;
  matched_entity_type: string | null;
  matched_entity_id: string | null;
  cost_center_group_id: string | null;
  cost_center_category_id: string | null;
}

interface LinkRow {
  movement_id: string;
  entity_type: "invoice" | "payable_entry";
  entity_id: string;
  amount_cents: number | null;
  allocated_amount_cents: number | null;
}

/** Leitura (só leitura) de `bank_movements` e das ligações a documentos, para a organização inteira. */
export class SupabaseBankMovementReadAdapter implements BankMovementReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async listDebits(organizationId: OrganizationId, from: string, to: string): Promise<StoredBankDebit[]> {
    const rows = await this.rows(organizationId, "debit", from, to);
    const links = await this.links(organizationId, rows.map((r) => r.id));
    return rows.map((r) => ({
      id: r.id,
      date: r.booking_date.slice(0, 10),
      amountCents: Math.abs(r.amount),
      description: r.description ?? "",
      reconciliationStatus: r.reconciliation_status,
      justificationType: r.justification_type,
      matchedEntityType: r.matched_entity_type,
      matchedEntityId: r.matched_entity_id,
      groupId: r.cost_center_group_id,
      categoryId: r.cost_center_category_id,
      links: links.get(r.id) ?? [],
    }));
  }

  async listCredits(organizationId: OrganizationId, from: string, to: string): Promise<StoredBankCredit[]> {
    const rows = await this.rows(organizationId, "credit", from, to);
    return rows.map((r) => ({
      id: r.id,
      date: r.booking_date.slice(0, 10),
      amountCents: Math.abs(r.amount),
      description: r.description ?? "",
      reconciliationStatus: r.reconciliation_status,
      justificationType: r.justification_type,
    }));
  }

  private async rows(organizationId: OrganizationId, type: "debit" | "credit", from: string, to: string): Promise<MovementRow[]> {
    // Paginado: o PostgREST corta em 1000 linhas.
    const rows: MovementRow[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await this.scopedQuery(organizationId)
        .table("bank_movements")
        .select(COLUMNS)
        .eq("movement_type", type)
        .gte("booking_date", from)
        .lte("booking_date", to)
        .order("booking_date", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as unknown as MovementRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    return rows;
  }

  private async links(organizationId: OrganizationId, movementIds: string[]): Promise<Map<string, BankDebitLink[]>> {
    const result = new Map<string, BankDebitLink[]>();
    for (let i = 0; i < movementIds.length; i += IN_CHUNK) {
      const { data, error } = await this.scopedQuery(organizationId)
        .table("bank_movement_entity_links")
        .select("movement_id, entity_type, entity_id, amount_cents, allocated_amount_cents")
        .in("movement_id", movementIds.slice(i, i + IN_CHUNK));
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as unknown as LinkRow[]) {
        const link: BankDebitLink = {
          entityType: row.entity_type,
          entityId: row.entity_id,
          // Ligações antigas têm `allocated_amount_cents` = 0 (valor por omissão): usa o do documento.
          amountCents: Math.abs(row.allocated_amount_cents || row.amount_cents || 0),
        };
        result.set(row.movement_id, [...(result.get(row.movement_id) ?? []), link]);
      }
    }
    return result;
  }
}

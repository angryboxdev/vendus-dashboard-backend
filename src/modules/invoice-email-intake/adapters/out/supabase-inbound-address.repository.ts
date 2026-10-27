import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { InboundAddress } from "../../domain/entities/inbound-address.js";
import type { InboundAddressRepositoryPort } from "../../domain/ports/out/email-intake.out-ports.js";

const COLUMNS = "id, local_part, status, created_at, created_by, deactivated_at, deactivated_by, deactivation_reason";

export function toInboundAddress(r: Record<string, unknown>): InboundAddress {
  return {
    id: r.id as string,
    localPart: r.local_part as string,
    status: r.status === "inactive" ? "inactive" : "active",
    createdAt: new Date(r.created_at as string),
    createdBy: (r.created_by as string | null) ?? null,
    deactivatedAt: r.deactivated_at ? new Date(r.deactivated_at as string) : null,
    deactivatedBy: (r.deactivated_by as string | null) ?? null,
    deactivationReason: (r.deactivation_reason as string | null) ?? null,
  };
}

export class SupabaseInboundAddressRepository implements InboundAddressRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async listAll(organizationId: OrganizationId): Promise<InboundAddress[]> {
    const { data, error } = await this.scopedQuery(organizationId).table("invoice_inbound_addresses").select(COLUMNS).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(toInboundAddress);
  }

  async rotate(organizationId: OrganizationId, localPart: string, actor: string, reason: string | null): Promise<InboundAddress> {
    const { data, error } = await this.scopedQuery(organizationId).rotateInvoiceInboundAddress(localPart, actor, reason);
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as { id: string; local_part: string; created_at: string } | undefined;
    if (!row) throw new Error("fn_rotate_invoice_inbound_address não devolveu o endereço");
    return toInboundAddress({ ...row, status: "active", created_by: actor });
  }
}

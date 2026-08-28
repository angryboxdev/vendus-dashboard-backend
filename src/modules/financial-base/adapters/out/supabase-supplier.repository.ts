import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { Supplier, type SupplierStatus } from "../../domain/entities/supplier.js";
import type {
  SupplierFilter,
  SupplierRepositoryPort,
} from "../../domain/ports/out/supplier-repository.port.js";

function toEntity(row: Record<string, unknown>): Supplier {
  return Supplier.reconstitute({
    id: row.id as string,
    name: row.name as string,
    nif: (row.nif as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    iban: (row.iban as string | null) ?? null,
    defaultCostCenterGroupId: (row.default_cost_center_group_id as string | null) ?? null,
    defaultCostCenterCategoryId: (row.default_cost_center_category_id as string | null) ?? null,
    paymentTermsDays: row.payment_terms_days != null ? Number(row.payment_terms_days) : null,
    notes: (row.notes as string | null) ?? null,
    status: row.status as SupplierStatus,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });
}

/**
 * Nunca guarda um `SupabaseClient` — recebe o factory `createScopedQuery`
 * (`ScopedQueryFactory`) injectado pelo composition root e constrói um
 * `ScopedQuery` por chamada (D2).
 */
export class SupabaseSupplierRepository implements SupplierRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async save(organizationId: OrganizationId, supplier: Supplier): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("suppliers").insert({
      id: supplier.id,
      name: supplier.name,
      nif: supplier.nif,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      iban: supplier.iban,
      default_cost_center_group_id: supplier.defaultCostCenterGroupId,
      default_cost_center_category_id: supplier.defaultCostCenterCategoryId,
      payment_terms_days: supplier.paymentTermsDays,
      notes: supplier.notes,
      status: supplier.status,
      created_at: supplier.createdAt.toISOString(),
      updated_at: supplier.updatedAt.toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<Supplier | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("suppliers")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as unknown as Record<string, unknown>);
  }

  async findAll(organizationId: OrganizationId, filter?: SupplierFilter): Promise<Supplier[]> {
    let q = this.scopedQuery(organizationId)
      .table("suppliers")
      .select("*")
      .order("name", { ascending: true });

    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.search) q = q.ilike("name", `%${filter.search}%`);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => toEntity(r));
  }

  async update(organizationId: OrganizationId, supplier: Supplier): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("suppliers")
      .update({
        name: supplier.name,
        nif: supplier.nif,
        email: supplier.email,
        phone: supplier.phone,
        address: supplier.address,
        iban: supplier.iban,
        default_cost_center_group_id: supplier.defaultCostCenterGroupId,
        default_cost_center_category_id: supplier.defaultCostCenterCategoryId,
        payment_terms_days: supplier.paymentTermsDays,
        notes: supplier.notes,
        status: supplier.status,
        updated_at: supplier.updatedAt.toISOString(),
      })
      .eq("id", supplier.id);
    if (error) throw new Error(error.message);
  }
}

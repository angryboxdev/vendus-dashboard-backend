import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { SupplierDeliverySchedule } from "../../domain/entities/supplier-delivery-schedule.js";
import type { SupplierDeliveryScheduleRepositoryPort } from "../../domain/ports/out/supplier-delivery-schedule-repository.port.js";

function toEntity(row: Record<string, unknown>): SupplierDeliverySchedule {
  return SupplierDeliverySchedule.reconstitute({
    id: row.id as string,
    supplierId: row.supplier_id as string,
    locationId: row.location_id as string,
    weekdays: (row.weekdays as number[] | null) ?? null,
    cutoffTime: (row.cutoff_time as string | null) ?? null,
    active: Boolean(row.active),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });
}

export class SupabaseSupplierDeliveryScheduleRepository implements SupplierDeliveryScheduleRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findAllForSupplier(organizationId: OrganizationId, supplierId: string): Promise<SupplierDeliverySchedule[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("supplier_delivery_schedules")
      .select("*")
      .eq("supplier_id", supplierId);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(toEntity);
  }

  async findOne(organizationId: OrganizationId, supplierId: string, locationId: string): Promise<SupplierDeliverySchedule | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("supplier_delivery_schedules")
      .select("*")
      .eq("supplier_id", supplierId)
      .eq("location_id", locationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toEntity(data as unknown as Record<string, unknown>) : null;
  }

  async upsert(organizationId: OrganizationId, schedule: SupplierDeliverySchedule): Promise<void> {
    const p = schedule.toProps();
    const { error } = await this.scopedQuery(organizationId)
      .table("supplier_delivery_schedules")
      .upsert(
        {
          id: p.id,
          supplier_id: p.supplierId,
          location_id: p.locationId,
          weekdays: p.weekdays,
          cutoff_time: p.cutoffTime,
          active: p.active,
          created_at: p.createdAt.toISOString(),
          updated_at: p.updatedAt.toISOString(),
        },
        { onConflict: "org_id,supplier_id,location_id" },
      );
    if (error) throw new Error(error.message);
  }
}

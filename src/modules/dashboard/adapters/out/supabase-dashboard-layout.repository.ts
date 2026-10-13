import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { DashboardLayout, WidgetPref } from "../../domain/entities/dashboard.js";
import type { DashboardLayoutRepositoryPort } from "../../domain/ports/out/dashboard.ports.js";

type Res = { data: unknown; error: { message: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Layout pessoal em `dashboard_layouts` (só metadados visuais). */
export class SupabaseDashboardLayoutRepository implements DashboardLayoutRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async get(org: OrganizationId, userId: string, dashboardKey: string): Promise<DashboardLayout | null> {
    const row = check<{ layout_version: number; widgets: WidgetPref[] } | null>(
      await this.scoped(org).table("dashboard_layouts").select("layout_version, widgets").eq("user_id", userId).eq("dashboard_key", dashboardKey).maybeSingle(),
    );
    return row ? { layoutVersion: row.layout_version, widgets: Array.isArray(row.widgets) ? row.widgets : [] } : null;
  }
  async save(org: OrganizationId, userId: string, dashboardKey: string, layout: DashboardLayout): Promise<void> {
    check(
      await this.scoped(org)
        .table("dashboard_layouts")
        .upsert({ user_id: userId, dashboard_key: dashboardKey, layout_version: layout.layoutVersion, widgets: layout.widgets, updated_at: new Date().toISOString() }, { onConflict: "org_id,user_id,dashboard_key" }),
    );
  }
  async remove(org: OrganizationId, userId: string, dashboardKey: string): Promise<void> {
    check(await this.scoped(org).table("dashboard_layouts").delete().eq("user_id", userId).eq("dashboard_key", dashboardKey));
  }
}

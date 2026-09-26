import { Router } from "express";
import type { GetHrOverviewPort, ListShiftsToReviewPort, ReviewPriority } from "../../domain/ports/in/overview.ports.js";

const VALID_PRIORITIES = new Set<ReviewPriority>(["CRITICA", "ALTA", "MEDIA", "BAIXA"]);

export class HrOverviewController {
  readonly router: Router;

  constructor(
    private readonly getHrOverview: GetHrOverviewPort,
    private readonly listShiftsToReview: ListShiftsToReviewPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /** GET /api/hr/overview — KPIs + alertas + snapshot. Só leitura (qualquer role autenticado, incl. hr_viewer). */
    this.router.get("/hr/overview", async (req, res) => {
      try {
        const { locationId } = req.query as Record<string, string | undefined>;
        const result = await this.getHrOverview.execute({
          organizationId: req.auth!.orgId,
          ...(locationId && { locationId }),
        });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /** GET /api/hr/overview/shifts-to-review — fila de conferência paginada/filtrada. */
    this.router.get("/hr/overview/shifts-to-review", async (req, res) => {
      try {
        const q = req.query as Record<string, string | undefined>;
        const priority = q.priority && VALID_PRIORITIES.has(q.priority as ReviewPriority) ? (q.priority as ReviewPriority) : undefined;
        const result = await this.listShiftsToReview.execute({
          organizationId: req.auth!.orgId,
          ...(q.locationId && { locationId: q.locationId }),
          ...(priority && { priority }),
          ...(q.search && { search: q.search }),
          page: q.page ? Math.max(1, Number(q.page)) : 1,
          pageSize: q.pageSize ? Math.min(100, Math.max(1, Number(q.pageSize))) : 10,
        });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });
  }
}

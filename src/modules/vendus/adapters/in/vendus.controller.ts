import { Router } from "express";
import { DateTime } from "luxon";
import type { GetAnalyticsCurrentPort } from "../../domain/ports/in/get-analytics-current.port.js";
import type { GetAnalyticsHistoricalPort } from "../../domain/ports/in/get-analytics-historical.port.js";
import type { GetSummaryPort } from "../../domain/ports/in/get-summary.port.js";
import type { GetDocumentDetailPort } from "../../domain/ports/in/get-document-detail.port.js";
import type { ListDocumentsPort } from "../../domain/ports/in/list-documents.port.js";
import type { GetSelfConsumptionPort } from "../../domain/ports/in/get-selfconsumption.port.js";

const LISBON = "Europe/Lisbon";

function parseYearMonth(
  req: { query: Record<string, unknown> },
  res: { status: (c: number) => { json: (b: unknown) => void } },
): { year: number; month: number } | null {
  const now = DateTime.now().setZone(LISBON);
  const year = req.query["year"] ? Number(req.query["year"]) : now.year;
  const month = req.query["month"] ? Number(req.query["month"]) : now.month;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    res.status(400).json({ error: "Parâmetro 'year' inválido" });
    return null;
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    res.status(400).json({ error: "Parâmetro 'month' inválido (1-12)" });
    return null;
  }
  return { year, month };
}

function parseDateRange(
  sinceParam: unknown,
  untilParam: unknown,
): { since: string; until: string } | { error: string } {
  const now = DateTime.now().setZone(LISBON);
  const since = typeof sinceParam === "string" && sinceParam ? sinceParam : now.startOf("month").toFormat("yyyy-MM-dd");
  const until = typeof untilParam === "string" && untilParam ? untilParam : now.toFormat("yyyy-MM-dd");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    return { error: "since/until devem ter formato YYYY-MM-DD" };
  }
  if (since > until) {
    return { error: "since não pode ser posterior a until" };
  }
  return { since, until };
}

export class VendusController {
  readonly router: Router;

  constructor(
    private readonly getAnalyticsCurrent: GetAnalyticsCurrentPort,
    private readonly getAnalyticsHistorical: GetAnalyticsHistoricalPort,
    private readonly getSummary: GetSummaryPort,
    private readonly getDocumentDetail: GetDocumentDetailPort,
    private readonly listDocuments: ListDocumentsPort,
    private readonly getSelfConsumption: GetSelfConsumptionPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /**
     * GET /api/vendus/analytics/current?year=2026&month=8
     * Métricas rápidas do mês: hoje, acumulado, projeção, por dia da semana.
     * Usa list docs apenas — sem breakdown por canal.
     */
    this.router.get("/vendus/analytics/current", async (req, res) => {
      const params = parseYearMonth(req as any, res as any);
      if (!params) return;
      try {
        const data = await this.getAnalyticsCurrent.execute(params);
        res.json(data);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro interno";
        console.error("[Vendus] GET /vendus/analytics/current falhou:", msg);
        res.status(500).json({ error: msg });
      }
    });

    /**
     * GET /api/vendus/analytics/historical?year=2026&month=8
     * Total anual, histórico, gráfico de crescimento, comparações.
     * Cache-aware para meses imutáveis — o único endpoint do módulo que toca
     * o Supabase, daí ser o único a ler `organizationId` de `req.auth`
     * (D2; nunca do body/params, para não ser um valor escolhido pelo cliente).
     */
    this.router.get("/vendus/analytics/historical", async (req, res) => {
      const params = parseYearMonth(req as any, res as any);
      if (!params) return;
      try {
        const data = await this.getAnalyticsHistorical.execute({
          ...params,
          organizationId: req.auth!.orgId,
        });
        res.json(data);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro interno";
        console.error("[Vendus] GET /vendus/analytics/historical falhou:", msg);
        res.status(500).json({ error: msg });
      }
    });

    /**
     * GET /api/vendus/summary?since=YYYY-MM-DD&until=YYYY-MM-DD
     * Documentos detalhados + analytics completos (byChannel, byCategory, etc.).
     * Análogo a GET /api/air-menu/summary.
     *
     * NOTA DE PERFORMANCE: este endpoint faz N fetches de detalhe (1 por doc).
     * Para períodos longos pode ser lento. Ver README — dívida técnica pós-MVP.
     */
    this.router.get("/vendus/summary", async (req, res) => {
      const range = parseDateRange(req.query["since"], req.query["until"]);
      if ("error" in range) {
        res.status(400).json({ error: range.error });
        return;
      }
      try {
        const result = await this.getSummary.execute(range);
        res.json(result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro interno";
        console.error("[Vendus] GET /vendus/summary falhou:", msg);
        res.status(500).json({ error: msg });
      }
    });

    /**
     * GET /api/vendus/documents?since=YYYY-MM-DD&until=YYYY-MM-DD[&type=FS,FT&per_page=50&page=1]
     * Lista de documentos sem detail (rápida).
     */
    this.router.get("/vendus/documents", async (req, res) => {
      const range = parseDateRange(req.query["since"], req.query["until"]);
      if ("error" in range) {
        res.status(400).json({ error: range.error });
        return;
      }
      const type = typeof req.query["type"] === "string" ? req.query["type"] : undefined;
      const per_page = req.query["per_page"] ? Number(req.query["per_page"]) : undefined;
      const page = req.query["page"] ? Number(req.query["page"]) : undefined;
      try {
        const result = await this.listDocuments.execute({
        ...range,
        ...(type !== undefined && { type }),
        ...(per_page !== undefined && { per_page }),
        ...(page !== undefined && { page }),
      });
        res.json(result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro interno";
        console.error("[Vendus] GET /vendus/documents falhou:", msg);
        res.status(500).json({ error: msg });
      }
    });

    /**
     * GET /api/vendus/selfconsumption?since=YYYY-MM-DD&until=YYYY-MM-DD
     * Registos de autoconsumo com analytics (por funcionário, categoria, top produtos).
     */
    this.router.get("/vendus/selfconsumption", async (req, res) => {
      const range = parseDateRange(req.query["since"], req.query["until"]);
      if ("error" in range) {
        res.status(400).json({ error: range.error });
        return;
      }
      try {
        const result = await this.getSelfConsumption.execute(range);
        res.json(result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro interno";
        console.error("[Vendus] GET /vendus/selfconsumption falhou:", msg);
        res.status(500).json({ error: msg });
      }
    });

    /**
     * GET /api/vendus/documents/:id
     * Detalhe de um documento com channel derivado e flag has_drinks.
     */
    this.router.get("/vendus/documents/:id", async (req, res) => {
      const id = Number(req.params["id"]);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "id inválido" });
        return;
      }
      try {
        const doc = await this.getDocumentDetail.execute(id);
        res.json(doc);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro interno";
        console.error(`[Vendus] GET /vendus/documents/${id} falhou:`, msg);
        res.status(500).json({ error: msg });
      }
    });
  }
}

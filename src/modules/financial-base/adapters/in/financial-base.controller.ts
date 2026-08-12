import { Router } from "express";
import PDFDocument from "pdfkit";
import { COMPANY } from "../../../../config/company.js";
import {
  CostCenterGroupNotFoundError,
  CostCenterGroupCodeAlreadyExistsError,
  CostCenterCategoryNotFoundError,
  CostCenterCategoryCodeAlreadyExistsError,
  InvalidFinancialTypeError,
  SupplierNotFoundError,
} from "../../domain/errors.js";
import { FINANCIAL_TYPES, type FinancialType } from "../../domain/entities/cost-center-category.js";
import type { ListCostCenterGroupsPort } from "../../domain/ports/in/cost-center-group.ports.js";
import type { GetCostCenterGroupPort } from "../../domain/ports/in/cost-center-group.ports.js";
import type { CreateCostCenterGroupPort } from "../../domain/ports/in/cost-center-group.ports.js";
import type { UpdateCostCenterGroupPort } from "../../domain/ports/in/cost-center-group.ports.js";
import type { ToggleCostCenterGroupStatusPort } from "../../domain/ports/in/cost-center-group.ports.js";
import type { ListCostCenterCategoriesPort } from "../../domain/ports/in/cost-center-category.ports.js";
import type { GetCostCenterCategoryPort } from "../../domain/ports/in/cost-center-category.ports.js";
import type { CreateCostCenterCategoryPort } from "../../domain/ports/in/cost-center-category.ports.js";
import type { UpdateCostCenterCategoryPort } from "../../domain/ports/in/cost-center-category.ports.js";
import type { ToggleCostCenterCategoryStatusPort } from "../../domain/ports/in/cost-center-category.ports.js";
import type { SeedDefaultCostCentersPort } from "../../domain/ports/in/cost-center-category.ports.js";
import type { CreateSupplierPort } from "../../domain/ports/in/supplier.ports.js";
import type { UpdateSupplierPort } from "../../domain/ports/in/supplier.ports.js";
import type { ToggleSupplierStatusPort } from "../../domain/ports/in/supplier.ports.js";
import type { ListSuppliersPort } from "../../domain/ports/in/supplier.ports.js";
import type { GetSupplierPort } from "../../domain/ports/in/supplier.ports.js";
import type { SupplierFilter } from "../../domain/ports/out/supplier-repository.port.js";
import type {
  GetSuppliersKpisPort,
  GetSupplierDetailPort,
  ListSuppliersWithStatsPort,
} from "../../domain/ports/in/supplier-detail.ports.js";
import type { GetSupplierStatementPort } from "../../domain/ports/in/supplier-statement.ports.js";
import type { SupplierStatementDTO } from "../../domain/ports/in/supplier-statement.ports.js";
import type { ListChannelsPort } from "../../domain/ports/in/channel.ports.js";

// ── Helpers de formatação ─────────────────────────────────────────────────────

const EUR = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const DATE_FMT = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });

function formatMoney(value: number): string {
  return EUR.format(value);
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return DATE_FMT.format(typeof date === "string" ? new Date(date) : date);
}

const STATUS_LABELS: Record<string, string> = {
  paid: "Paga",
  pending: "Pendente",
  overdue: "Vencida",
  partial: "Parcial",
  cancelled: "Anulada",
  draft_ai: "Rascunho IA",
  pending_review: "Em revisão",
};

// ── Geração de PDF ────────────────────────────────────────────────────────────

function buildStatementPdf(data: SupplierStatementDTO): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 40, size: "A4" });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - 80; // total usável (margens 40+40)
    const gray = "#6b7280";
    const dark = "#111827";
    const accent = "#ED5C32";
    const lineGray = "#e5e7eb";

    // ── Cabeçalho ───────────────────────────────────────────────────────────
    doc
      .fontSize(18).fillColor(accent).font("Helvetica-Bold")
      .text("Extrato de Fornecedor", 40, 40);

    doc.fontSize(9).fillColor(gray).font("Helvetica")
      .text(COMPANY.name || "—", 40, 66)
      .text(`NIF: ${COMPANY.nif || "—"}`, 40, 78)
      .text(COMPANY.address || "", 40, 90);

    // Período (canto direito)
    const periodLabel = (() => {
      const { startDate, endDate } = data.period;
      if (startDate && endDate) return `${formatDate(startDate)} – ${formatDate(endDate)}`;
      if (startDate) return `A partir de ${formatDate(startDate)}`;
      if (endDate) return `Até ${formatDate(endDate)}`;
      return "Histórico completo";
    })();
    doc.text(`Período: ${periodLabel}`, 40, 66, { align: "right", width: pageWidth });
    doc.text(`Gerado em: ${formatDate(new Date())}`, 40, 78, { align: "right", width: pageWidth });

    // Linha separadora
    doc.moveTo(40, 112).lineTo(40 + pageWidth, 112).strokeColor(lineGray).lineWidth(1).stroke();

    // ── Dados do fornecedor ──────────────────────────────────────────────────
    const s = data.supplier;
    doc.y = 120;
    doc.fontSize(11).fillColor(dark).font("Helvetica-Bold").text(s.name, 40);
    doc.fontSize(9).fillColor(gray).font("Helvetica");

    const supplierFields: [string, string | null | undefined][] = [
      ["NIF", s.nif],
      ["Email", s.email],
      ["Telefone", s.phone],
      ["Prazo de pagamento", s.paymentTermsDays ? `${s.paymentTermsDays} dias` : null],
    ];
    for (const [label, value] of supplierFields) {
      if (value) doc.text(`${label}: ${value}`, 40);
    }

    // ── KPI cards (linha) ────────────────────────────────────────────────────
    const kpiY = doc.y + 14;
    const kpiW = pageWidth / 3;
    const kpis: [string, string][] = [
      ["Total faturado", formatMoney(data.stats.totalBilled)],
      ["Total pago", formatMoney(data.stats.totalPaid)],
      ["Total pendente", formatMoney(data.stats.totalPending)],
    ];

    kpis.forEach(([label, value], i) => {
      const x = 40 + i * kpiW;
      doc.rect(x, kpiY, kpiW - 8, 38).fillAndStroke("#f9fafb", lineGray);
      doc.fontSize(7).fillColor(gray).font("Helvetica").text(label, x + 6, kpiY + 6, { width: kpiW - 20 });
      doc.fontSize(12).fillColor(dark).font("Helvetica-Bold").text(value, x + 6, kpiY + 17, { width: kpiW - 20 });
    });

    doc.y = kpiY + 48;

    // ── Tabela de faturas ────────────────────────────────────────────────────
    doc.fontSize(10).fillColor(dark).font("Helvetica-Bold").text("Faturas", 40, doc.y + 6);
    doc.y += 22;

    // Cabeçalho da tabela
    const cols = {
      num:      { x: 40,   w: 80 },
      date:     { x: 124,  w: 68 },
      due:      { x: 196,  w: 68 },
      netVal:   { x: 268,  w: 72 },
      vat:      { x: 344,  w: 60 },
      total:    { x: 408,  w: 72 },
      status:   { x: 484,  w: 72 },
    };

    const headerY = doc.y;
    doc.rect(40, headerY, pageWidth, 18).fill("#f3f4f6");

    doc.fontSize(7).fillColor(gray).font("Helvetica-Bold");
    doc.text("Nº Fatura",    cols.num.x + 4,    headerY + 5, { width: cols.num.w });
    doc.text("Emissão",      cols.date.x,        headerY + 5, { width: cols.date.w });
    doc.text("Vencimento",   cols.due.x,         headerY + 5, { width: cols.due.w });
    doc.text("Valor s/ IVA", cols.netVal.x,      headerY + 5, { width: cols.netVal.w, align: "right" });
    doc.text("IVA",          cols.vat.x,         headerY + 5, { width: cols.vat.w, align: "right" });
    doc.text("Total c/ IVA", cols.total.x,       headerY + 5, { width: cols.total.w, align: "right" });
    doc.text("Estado",       cols.status.x,      headerY + 5, { width: cols.status.w });

    doc.y = headerY + 18;

    // Linhas de dados
    for (let i = 0; i < data.invoices.length; i++) {
      const inv = data.invoices[i]!;
      const rowY = doc.y;

      // Nova página se necessário (rodapé reserva 60px)
      if (rowY > doc.page.height - 80) {
        doc.addPage();
        doc.y = 40;
      }

      const bg = i % 2 === 0 ? "#ffffff" : "#f9fafb";
      doc.rect(40, doc.y, pageWidth, 16).fill(bg);

      doc.fontSize(8).fillColor(dark).font("Helvetica");
      const ry = doc.y + 4;
      doc.text(inv.invoiceNumber,             cols.num.x + 4,   ry, { width: cols.num.w });
      doc.text(formatDate(inv.invoiceDate),   cols.date.x,      ry, { width: cols.date.w });
      doc.text(formatDate(inv.dueDate),       cols.due.x,       ry, { width: cols.due.w });
      doc.text(formatMoney(inv.totalWithoutVat), cols.netVal.x, ry, { width: cols.netVal.w, align: "right" });
      doc.text(formatMoney(inv.vatAmount),    cols.vat.x,       ry, { width: cols.vat.w, align: "right" });
      doc.text(formatMoney(inv.totalWithVat), cols.total.x,     ry, { width: cols.total.w, align: "right" });
      doc.text(STATUS_LABELS[inv.status] ?? inv.status, cols.status.x, ry, { width: cols.status.w });

      doc.y += 16;
    }

    // Linha de total
    doc.moveTo(40, doc.y).lineTo(40 + pageWidth, doc.y).strokeColor(lineGray).lineWidth(0.5).stroke();
    doc.y += 6;
    doc.fontSize(8).fillColor(dark).font("Helvetica-Bold");
    doc.text(`${data.stats.invoiceCount} fatura(s)`, cols.num.x + 4, doc.y, { width: cols.num.w });
    doc.text(formatMoney(data.stats.totalBilled), cols.total.x, doc.y, { width: cols.total.w, align: "right" });

    // ── Rodapé ───────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 40;
    doc.moveTo(40, footerY - 10).lineTo(40 + pageWidth, footerY - 10).strokeColor(lineGray).lineWidth(0.5).stroke();
    doc.fontSize(7).fillColor(gray).font("Helvetica")
      .text(
        `Extrato gerado a partir das faturas registadas no Angrybox Hub em ${formatDate(new Date())}`,
        40,
        footerY - 4,
        { width: pageWidth, align: "center" },
      );

    doc.end();
  });
}

// ── Controller ────────────────────────────────────────────────────────────────

export class FinancialBaseController {
  readonly router: Router;

  constructor(
    private readonly listCostCenterGroups: ListCostCenterGroupsPort,
    private readonly getCostCenterGroup: GetCostCenterGroupPort,
    private readonly createCostCenterGroup: CreateCostCenterGroupPort,
    private readonly updateCostCenterGroup: UpdateCostCenterGroupPort,
    private readonly toggleCostCenterGroupStatus: ToggleCostCenterGroupStatusPort,
    private readonly listCostCenterCategories: ListCostCenterCategoriesPort,
    private readonly getCostCenterCategory: GetCostCenterCategoryPort,
    private readonly createCostCenterCategory: CreateCostCenterCategoryPort,
    private readonly updateCostCenterCategory: UpdateCostCenterCategoryPort,
    private readonly toggleCostCenterCategoryStatus: ToggleCostCenterCategoryStatusPort,
    private readonly seedDefaultCostCenters: SeedDefaultCostCentersPort,
    private readonly createSupplier: CreateSupplierPort,
    private readonly updateSupplier: UpdateSupplierPort,
    private readonly toggleSupplierStatus: ToggleSupplierStatusPort,
    private readonly listSuppliers: ListSuppliersPort,
    private readonly getSupplier: GetSupplierPort,
    private readonly listSuppliersWithStats: ListSuppliersWithStatsPort,
    private readonly getSuppliersKpis: GetSuppliersKpisPort,
    private readonly getSupplierDetail: GetSupplierDetailPort,
    private readonly getSupplierStatement: GetSupplierStatementPort,
    private readonly listChannels: ListChannelsPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    // ── Cost Center Groups ───────────────────────────────────────────────────

    /**
     * GET /financial-base/cost-center-groups
     * Query: isActive? (boolean)
     */
    this.router.get("/financial-base/cost-center-groups", async (req, res) => {
      try {
        const { isActive } = req.query as Record<string, string | undefined>;
        const command: Parameters<typeof this.listCostCenterGroups.execute>[0] = {};
        if (isActive === "true") command.isActive = true;
        else if (isActive === "false") command.isActive = false;
        const results = await this.listCostCenterGroups.execute(command);
        res.json(results);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * GET /financial-base/cost-center-groups/financial-types
     * Lista os tipos financeiros válidos (útil para selects no frontend).
     */
    this.router.get("/financial-base/cost-center-groups/financial-types", (_req, res) => {
      res.json(FINANCIAL_TYPES);
    });

    /**
     * GET /financial-base/cost-center-groups/:id
     */
    this.router.get("/financial-base/cost-center-groups/:id", async (req, res) => {
      try {
        const result = await this.getCostCenterGroup.execute({ id: req.params["id"] as string });
        res.json(result);
      } catch (e) {
        if (e instanceof CostCenterGroupNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * POST /financial-base/cost-center-groups
     * Body: { code, name, description?, sortOrder? }
     */
    this.router.post("/financial-base/cost-center-groups", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.code !== "string" || body.code.trim().length === 0) {
          res.status(400).json({ error: "code é obrigatório" });
          return;
        }
        if (typeof body.name !== "string" || body.name.trim().length === 0) {
          res.status(400).json({ error: "name é obrigatório" });
          return;
        }
        const result = await this.createCostCenterGroup.execute({
          code: body.code as string,
          name: body.name as string,
          description: (body.description as string | null | undefined) ?? null,
          sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
        });
        res.status(201).json(result);
      } catch (e) {
        if (e instanceof CostCenterGroupCodeAlreadyExistsError) {
          res.status(409).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * PATCH /financial-base/cost-center-groups/:id
     * Body: { name?, description?, sortOrder? }
     */
    this.router.patch("/financial-base/cost-center-groups/:id", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const data: Parameters<typeof this.updateCostCenterGroup.execute>[0]["data"] = {};
        if (body.name !== undefined) data.name = body.name as string;
        if ("description" in body) data.description = (body.description as string | null) ?? null;
        if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder);
        const result = await this.updateCostCenterGroup.execute({
          id: req.params["id"] as string,
          data,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof CostCenterGroupNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * PATCH /financial-base/cost-center-groups/:id/status
     * Body: { isActive: boolean }
     */
    this.router.patch("/financial-base/cost-center-groups/:id/status", async (req, res) => {
      try {
        const body = req.body as { isActive?: unknown };
        if (typeof body.isActive !== "boolean") {
          res.status(400).json({ error: "isActive deve ser booleano" });
          return;
        }
        const result = await this.toggleCostCenterGroupStatus.execute({
          id: req.params["id"] as string,
          isActive: body.isActive,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof CostCenterGroupNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    // ── Cost Center Categories ───────────────────────────────────────────────

    /**
     * GET /financial-base/cost-center-categories
     * Query: groupId?, isActive?
     */
    this.router.get("/financial-base/cost-center-categories", async (req, res) => {
      try {
        const { groupId, isActive } = req.query as Record<string, string | undefined>;
        const command: Parameters<typeof this.listCostCenterCategories.execute>[0] = {};
        if (groupId) command.groupId = groupId;
        if (isActive === "true") command.isActive = true;
        else if (isActive === "false") command.isActive = false;
        const results = await this.listCostCenterCategories.execute(command);
        res.json(results);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * GET /financial-base/cost-center-categories/:id
     */
    this.router.get("/financial-base/cost-center-categories/:id", async (req, res) => {
      try {
        const result = await this.getCostCenterCategory.execute({
          id: req.params["id"] as string,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof CostCenterCategoryNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * POST /financial-base/cost-center-categories
     * Body: { groupId, code, name, financialType, affectsDre, affectsCashflow,
     *         affectsProfitability, requiresChannel?, requiresAllocation?, description? }
     */
    this.router.post("/financial-base/cost-center-categories", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.groupId !== "string" || body.groupId.trim().length === 0) {
          res.status(400).json({ error: "groupId é obrigatório" });
          return;
        }
        if (typeof body.code !== "string" || body.code.trim().length === 0) {
          res.status(400).json({ error: "code é obrigatório" });
          return;
        }
        if (typeof body.name !== "string" || body.name.trim().length === 0) {
          res.status(400).json({ error: "name é obrigatório" });
          return;
        }
        if (!FINANCIAL_TYPES.includes(body.financialType as FinancialType)) {
          res.status(400).json({ error: "financialType inválido" });
          return;
        }
        if (typeof body.affectsDre !== "boolean") {
          res.status(400).json({ error: "affectsDre é obrigatório (boolean)" });
          return;
        }
        if (typeof body.affectsCashflow !== "boolean") {
          res.status(400).json({ error: "affectsCashflow é obrigatório (boolean)" });
          return;
        }
        if (typeof body.affectsProfitability !== "boolean") {
          res.status(400).json({ error: "affectsProfitability é obrigatório (boolean)" });
          return;
        }
        const result = await this.createCostCenterCategory.execute({
          groupId: body.groupId as string,
          code: body.code as string,
          name: body.name as string,
          financialType: body.financialType as FinancialType,
          affectsDre: body.affectsDre as boolean,
          affectsCashflow: body.affectsCashflow as boolean,
          affectsProfitability: body.affectsProfitability as boolean,
          requiresChannel: (body.requiresChannel as boolean | undefined) ?? false,
          requiresAllocation: (body.requiresAllocation as boolean | undefined) ?? false,
          description: (body.description as string | null | undefined) ?? null,
        });
        res.status(201).json(result);
      } catch (e) {
        if (e instanceof CostCenterCategoryCodeAlreadyExistsError) {
          res.status(409).json({ error: e.message });
          return;
        }
        if (e instanceof CostCenterGroupNotFoundError) {
          res.status(422).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * PATCH /financial-base/cost-center-categories/:id
     * Body: campos opcionais editáveis
     */
    this.router.patch("/financial-base/cost-center-categories/:id", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (body.financialType !== undefined && !FINANCIAL_TYPES.includes(body.financialType as FinancialType)) {
          res.status(400).json({ error: "financialType inválido" });
          return;
        }
        const data: Parameters<typeof this.updateCostCenterCategory.execute>[0]["data"] = {};
        if (body.name !== undefined) data.name = body.name as string;
        if (body.financialType !== undefined) data.financialType = body.financialType as FinancialType;
        if (body.affectsDre !== undefined) data.affectsDre = body.affectsDre as boolean;
        if (body.affectsCashflow !== undefined) data.affectsCashflow = body.affectsCashflow as boolean;
        if (body.affectsProfitability !== undefined)
          data.affectsProfitability = body.affectsProfitability as boolean;
        if (body.requiresChannel !== undefined) data.requiresChannel = body.requiresChannel as boolean;
        if (body.requiresAllocation !== undefined)
          data.requiresAllocation = body.requiresAllocation as boolean;
        if ("description" in body) data.description = (body.description as string | null) ?? null;
        const result = await this.updateCostCenterCategory.execute({
          id: req.params["id"] as string,
          data,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof CostCenterCategoryNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        if (e instanceof InvalidFinancialTypeError) {
          res.status(400).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * PATCH /financial-base/cost-center-categories/:id/status
     * Body: { isActive: boolean }
     */
    this.router.patch("/financial-base/cost-center-categories/:id/status", async (req, res) => {
      try {
        const body = req.body as { isActive?: unknown };
        if (typeof body.isActive !== "boolean") {
          res.status(400).json({ error: "isActive deve ser booleano" });
          return;
        }
        const result = await this.toggleCostCenterCategoryStatus.execute({
          id: req.params["id"] as string,
          isActive: body.isActive,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof CostCenterCategoryNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * POST /financial-base/cost-centers/seed
     * Popula os 7 grupos e 28 subcategorias padrão (idempotente).
     */
    this.router.post("/financial-base/cost-centers/seed", async (_req, res) => {
      try {
        const result = await this.seedDefaultCostCenters.execute();
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    // ── Channels ─────────────────────────────────────────────────────────────

    /**
     * GET /financial-base/channels
     * Query: isActive? (boolean)
     */
    this.router.get("/financial-base/channels", async (req, res) => {
      try {
        const { isActive } = req.query as Record<string, string | undefined>;
        const filter = isActive === "true" ? true : isActive === "false" ? false : undefined;
        const results = await this.listChannels.execute(filter);
        res.json(results);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    // ── Suppliers ───────────────────────────────────────────────────────────

    /**
     * GET /financial-base/suppliers
     * Query: status?, search?, includeStats? (boolean)
     * Com includeStats=true devolve SupplierWithStatsDTO[] (agrega dados de faturas).
     */
    this.router.get("/financial-base/suppliers", async (req, res) => {
      try {
        const { status, search, includeStats } = req.query as Record<string, string | undefined>;

        if (includeStats === "true") {
          const command: Parameters<typeof this.listSuppliersWithStats.execute>[0] = {};
          if (status === "active" || status === "inactive") command.status = status;
          if (search) command.search = search;
          const results = await this.listSuppliersWithStats.execute(command);
          res.json(results);
          return;
        }

        const filter: SupplierFilter = {};
        if (status === "active" || status === "inactive") filter.status = status;
        if (search) filter.search = search;
        const results = await this.listSuppliers.execute(filter);
        res.json(results);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * GET /financial-base/suppliers/kpis
     * KPIs globais: total ativos, inativos, com pendências e total faturado.
     * DEVE ficar registado ANTES de /:id para evitar que "kpis" seja interpretado como id.
     */
    this.router.get("/financial-base/suppliers/kpis", async (_req, res) => {
      try {
        const result = await this.getSuppliersKpis.execute();
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * GET /financial-base/suppliers/:id/detail
     * Detalhe completo do fornecedor: dados base + resumo financeiro + lista de faturas.
     * DEVE ficar registado ANTES de /:id para não ser capturado pela rota genérica.
     */
    this.router.get("/financial-base/suppliers/:id/detail", async (req, res) => {
      try {
        const result = await this.getSupplierDetail.execute({
          id: req.params["id"] as string,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof SupplierNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * GET /financial-base/suppliers/:id/statement-pdf
     * Query: startDate? (YYYY-MM-DD), endDate? (YYYY-MM-DD)
     * Devolve application/pdf com o extrato do fornecedor.
     */
    this.router.get("/financial-base/suppliers/:id/statement-pdf", async (req, res) => {
      try {
        const { startDate: startStr, endDate: endStr } = req.query as Record<string, string | undefined>;

        const startDate = startStr ? new Date(startStr) : undefined;
        const endDate = endStr ? new Date(endStr) : undefined;

        if (startDate && isNaN(startDate.getTime())) {
          res.status(400).json({ error: "startDate inválido (usa formato YYYY-MM-DD)" });
          return;
        }
        if (endDate && isNaN(endDate.getTime())) {
          res.status(400).json({ error: "endDate inválido (usa formato YYYY-MM-DD)" });
          return;
        }

        const data = await this.getSupplierStatement.execute({
          id: req.params["id"] as string,
          startDate,
          endDate,
        });

        const pdf = await buildStatementPdf(data);

        const filename = `extrato-${data.supplier.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}.pdf`;
        res.set({
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(pdf.length),
        });
        res.send(pdf);
      } catch (e) {
        if (e instanceof SupplierNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * GET /financial-base/suppliers/:id
     */
    this.router.get("/financial-base/suppliers/:id", async (req, res) => {
      try {
        const result = await this.getSupplier.execute({ id: req.params["id"] as string });
        res.json(result);
      } catch (e) {
        if (e instanceof SupplierNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * POST /financial-base/suppliers
     * Body: { name, nif?, email?, phone?, address?, iban?,
     *         defaultCostCenterGroupId?, defaultCostCenterCategoryId?,
     *         paymentTermsDays?, notes? }
     */
    this.router.post("/financial-base/suppliers", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.name !== "string" || body.name.trim().length === 0) {
          res.status(400).json({ error: "name é obrigatório" });
          return;
        }
        const result = await this.createSupplier.execute({
          name: body.name as string,
          nif: (body.nif as string | null | undefined) ?? null,
          email: (body.email as string | null | undefined) ?? null,
          phone: (body.phone as string | null | undefined) ?? null,
          address: (body.address as string | null | undefined) ?? null,
          iban: (body.iban as string | null | undefined) ?? null,
          defaultCostCenterGroupId:
            (body.defaultCostCenterGroupId as string | null | undefined) ?? null,
          defaultCostCenterCategoryId:
            (body.defaultCostCenterCategoryId as string | null | undefined) ?? null,
          paymentTermsDays:
            body.paymentTermsDays != null ? Number(body.paymentTermsDays) : null,
          notes: (body.notes as string | null | undefined) ?? null,
        });
        res.status(201).json(result);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * PATCH /financial-base/suppliers/:id
     * Body: campos opcionais a actualizar
     */
    this.router.patch("/financial-base/suppliers/:id", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const data: Parameters<typeof this.updateSupplier.execute>[0]["data"] = {};
        if (body.name !== undefined) data.name = body.name as string;
        if ("nif" in body) data.nif = (body.nif as string | null) ?? null;
        if ("email" in body) data.email = (body.email as string | null) ?? null;
        if ("phone" in body) data.phone = (body.phone as string | null) ?? null;
        if ("address" in body) data.address = (body.address as string | null) ?? null;
        if ("iban" in body) data.iban = (body.iban as string | null) ?? null;
        if ("defaultCostCenterGroupId" in body)
          data.defaultCostCenterGroupId =
            (body.defaultCostCenterGroupId as string | null) ?? null;
        if ("defaultCostCenterCategoryId" in body)
          data.defaultCostCenterCategoryId =
            (body.defaultCostCenterCategoryId as string | null) ?? null;
        if ("paymentTermsDays" in body)
          data.paymentTermsDays =
            body.paymentTermsDays != null ? Number(body.paymentTermsDays) : null;
        if ("notes" in body) data.notes = (body.notes as string | null) ?? null;
        const result = await this.updateSupplier.execute({
          id: req.params["id"] as string,
          data,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof SupplierNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * PATCH /financial-base/suppliers/:id/status
     * Body: { status: "active" | "inactive" }
     */
    this.router.patch("/financial-base/suppliers/:id/status", async (req, res) => {
      try {
        const body = req.body as { status?: unknown };
        if (body.status !== "active" && body.status !== "inactive") {
          res.status(400).json({ error: "status deve ser 'active' ou 'inactive'" });
          return;
        }
        const result = await this.toggleSupplierStatus.execute({
          id: req.params["id"] as string,
          status: body.status,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof SupplierNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });
  }
}

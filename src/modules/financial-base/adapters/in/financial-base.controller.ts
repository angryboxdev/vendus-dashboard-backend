import { Router } from "express";
import PDFDocument from "pdfkit";
import path from "node:path";
import type { OrganizationIdentity } from "../../domain/entities/organization-identity.js";
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
import type {
  GetSuppliersKpisPort,
  GetSupplierDetailPort,
  ListSuppliersWithStatsPort,
} from "../../domain/ports/in/supplier-detail.ports.js";
import type { GetSupplierStatementPort } from "../../domain/ports/in/supplier-statement.ports.js";
import type { SupplierStatementDTO } from "../../domain/ports/in/supplier-statement.ports.js";
import type { ListChannelsPort } from "../../domain/ports/in/channel.ports.js";
import type { GetOrganizationIdentityPort } from "../../domain/ports/in/organization-identity.ports.js";

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

// ── Geração de PDF — Extrato de Conta Corrente ────────────────────────────────

type LineKind = "invoice" | "credit_note" | "payment" | "settlement";

const KIND_BADGE: Record<LineKind, { label: string; bg: string; text: string }> = {
  invoice: { label: "Fatura", bg: "#dbeafe", text: "#1d4ed8" },
  credit_note: { label: "Nota de crédito", bg: "#fee2e2", text: "#b91c1c" },
  payment: { label: "Liquidação", bg: "#d1fae5", text: "#047857" },
  settlement: { label: "Liquidação", bg: "#d1fae5", text: "#047857" },
};

const KIND_PREFIX: Record<LineKind, string> = {
  invoice: "FT ",
  credit_note: "NC ",
  payment: "PG ",
  settlement: "",
};

// Relativo ao cwd (não a __dirname), para resolver igual em dev (tsx a
// partir de src/) e em produção (node a partir de dist/) — ambos correm com
// cwd = raiz do repositório.
const LOGO_PATH = path.join(process.cwd(), "assets", "angry-box-logo.png");

function buildStatementPdf(data: SupplierStatementDTO, organization: OrganizationIdentity): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - 80; // total usável (margens 40+40)
    const gray = "#6b7280";
    const dark = "#111827";
    const accent = "#ED5C32";
    const lineGray = "#e5e7eb";
    const cardBg = "#f9fafb";
    const greenBg = "#ecfdf5";
    const greenBorder = "#a7f3d0";
    const greenText = "#047857";
    const amberBg = "#fef3c7";
    const amberText = "#b45309";
    const redText = "#b91c1c";

    function badge(text: string, x: number, y: number, bg: string, textColor: string, align: "left" | "right" = "left"): number {
      doc.fontSize(8).font("Helvetica-Bold");
      const textWidth = doc.widthOfString(text);
      const w = textWidth + 14;
      const bx = align === "right" ? x - w : x;
      doc.roundedRect(bx, y, w, 16, 8).fill(bg);
      doc.fillColor(textColor).text(text, bx, y + 4, { width: w, align: "center" });
      return w;
    }

    // ── Cabeçalho ───────────────────────────────────────────────────────────
    const periodLabel = (() => {
      const { startDate, endDate } = data.period;
      if (startDate && endDate) return `${formatDate(startDate)} a ${formatDate(endDate)}`;
      if (startDate) return `A partir de ${formatDate(startDate)}`;
      if (endDate) return `Até ${formatDate(endDate)}`;
      return "Histórico completo";
    })();

    try {
      doc.image(LOGO_PATH, 40, 36, { width: 54 });
    } catch {
      // Logotipo indisponível (ex: asset não copiado neste ambiente) — não bloqueia a geração do PDF.
    }

    doc.fontSize(18).fillColor(dark).font("Helvetica-Bold")
      .text("Extrato de Conta Corrente", 40, 40, { align: "right", width: pageWidth });
    doc.fontSize(8).fillColor(gray).font("Helvetica")
      .text(`Período: ${periodLabel}`, 40, 64, { align: "right", width: pageWidth })
      .text(`Emissão: ${formatDate(new Date())} | Moeda: EUR`, 40, 76, { align: "right", width: pageWidth });

    const reconciledBadge = data.isReconciled
      ? { label: "Conta corrente conciliada", bg: greenBg, text: greenText }
      : { label: "Saldo em aberto", bg: amberBg, text: amberText };
    badge(reconciledBadge.label, 40 + pageWidth, 94, reconciledBadge.bg, reconciledBadge.text, "right");

    doc.moveTo(40, 122).lineTo(40 + pageWidth, 122).strokeColor(lineGray).lineWidth(1).stroke();

    // ── Cartões Emitente / Fornecedor ────────────────────────────────────────
    const cardY = 134;
    const cardGap = 14;
    const cardW = (pageWidth - cardGap) / 2;
    const cardH = 82;

    doc.rect(40, cardY, cardW, cardH).fillAndStroke("#ffffff", lineGray);
    doc.rect(40 + cardW + cardGap, cardY, cardW, cardH).fillAndStroke("#ffffff", lineGray);

    doc.fontSize(7).fillColor(gray).font("Helvetica-Bold").text("EMITENTE", 40 + 10, cardY + 10);
    doc.fontSize(10).fillColor(dark).font("Helvetica-Bold").text(organization.name || "—", 40 + 10, cardY + 22, { width: cardW - 20 });
    doc.fontSize(8).fillColor(gray).font("Helvetica")
      .text(`NIF: ${organization.nif || "—"}`, 40 + 10, cardY + 36, { width: cardW - 20 })
      .text(organization.address || "", 40 + 10, cardY + 47, { width: cardW - 20 });

    const supX = 40 + cardW + cardGap + 10;
    doc.fontSize(7).fillColor(gray).font("Helvetica-Bold").text("FORNECEDOR", supX, cardY + 10);
    doc.fontSize(10).fillColor(dark).font("Helvetica-Bold").text(data.supplier.name, supX, cardY + 22, { width: cardW - 20 });
    doc.fontSize(8).fillColor(gray).font("Helvetica")
      .text(`NIF: ${data.supplier.nif || "—"}`, supX, cardY + 36, { width: cardW - 20 });
    doc.fillColor(gray).text("Saldo inicial considerado: ", supX, cardY + 48, { continued: true, width: cardW - 20 })
      .fillColor(dark).font("Helvetica-Bold").text(formatMoney(data.openingBalance));

    // ── KPI cards ─────────────────────────────────────────────────────────────
    const kpiY = cardY + cardH + 14;
    const kpiGap = 8;
    const kpiW = (pageWidth - kpiGap * 3) / 4;
    const kpis: [string, string, boolean][] = [
      ["FATURAÇÃO (FT)", formatMoney(data.totalInvoiced), false],
      ["NOTAS DE CRÉDITO", formatMoney(data.totalCreditNotes), false],
      ["TOTAL MOVIMENTADO", formatMoney(data.totalMovement), false],
      ["SALDO FINAL", formatMoney(data.finalBalance), true],
    ];
    kpis.forEach(([label, value, isBalance], i) => {
      const x = 40 + i * (kpiW + kpiGap);
      const highlight = isBalance && data.isReconciled;
      doc.rect(x, kpiY, kpiW, 42).fillAndStroke(highlight ? greenBg : cardBg, highlight ? greenBorder : lineGray);
      doc.fontSize(6.5).fillColor(gray).font("Helvetica-Bold").text(label, x + 8, kpiY + 8, { width: kpiW - 16 });
      const valueColor = isBalance ? (data.isReconciled ? greenText : data.finalBalance > 0 ? redText : dark) : dark;
      doc.fontSize(12).fillColor(valueColor).font("Helvetica-Bold").text(value, x + 8, kpiY + 20, { width: kpiW - 16 });
    });

    // ── Tabela "Movimentos e Conciliação" ────────────────────────────────────
    let y = kpiY + 42 + 18;
    doc.fontSize(10).fillColor(dark).font("Helvetica-Bold").text("Movimentos e Conciliação", 40, y);
    doc.fontSize(8).fillColor(gray).font("Helvetica")
      .text("(por data de emissão)", 40, y, { align: "right", width: pageWidth });
    y += 20;

    const cols = {
      date: { x: 40, w: 60 },
      doc: { x: 100, w: 135 },
      kind: { x: 235, w: 85 },
      invoiced: { x: 320, w: 75 },
      credit: { x: 395, w: 90 },
      balance: { x: 485, w: 70 },
    };

    function drawTableHeader(headerY: number): void {
      doc.rect(40, headerY, pageWidth, 18).fill("#f3f4f6");
      doc.fontSize(7).fillColor(gray).font("Helvetica-Bold");
      doc.text("DATA", cols.date.x + 4, headerY + 6, { width: cols.date.w });
      doc.text("DOCUMENTO", cols.doc.x, headerY + 6, { width: cols.doc.w });
      doc.text("TIPO", cols.kind.x, headerY + 6, { width: cols.kind.w });
      doc.text("FATURADO", cols.invoiced.x, headerY + 6, { width: cols.invoiced.w, align: "right" });
      doc.text("N. CRÉDITO / LIQ.", cols.credit.x, headerY + 6, { width: cols.credit.w, align: "right" });
      doc.text("SALDO", cols.balance.x, headerY + 6, { width: cols.balance.w - 4, align: "right" });
    }

    drawTableHeader(y);
    y += 18;

    const ROW_H = 20;
    for (let i = 0; i < data.lines.length; i++) {
      const line = data.lines[i]!;

      if (y > doc.page.height - 100) {
        doc.addPage();
        y = 40;
        drawTableHeader(y);
        y += 18;
      }

      const bg = i % 2 === 0 ? "#ffffff" : "#f9fafb";
      doc.rect(40, y, pageWidth, ROW_H).fill(bg);

      const ry = y + 5;
      doc.fontSize(8).fillColor(dark).font("Helvetica");
      doc.text(line.date ? formatDate(new Date(line.date)) : "-", cols.date.x + 4, ry, { width: cols.date.w });
      doc.text(`${KIND_PREFIX[line.kind]}${line.documentNumber ?? "-"}`, cols.doc.x, ry, { width: cols.doc.w });

      const kindStyle = KIND_BADGE[line.kind];
      badge(kindStyle.label, cols.kind.x, y + 3, kindStyle.bg, kindStyle.text);

      doc.fillColor(dark).font("Helvetica");
      doc.text(line.invoicedAmount != null ? formatMoney(line.invoicedAmount) : "-", cols.invoiced.x, ry, { width: cols.invoiced.w, align: "right" });
      doc.text(line.creditOrSettlementAmount != null ? formatMoney(line.creditOrSettlementAmount) : "-", cols.credit.x, ry, { width: cols.credit.w, align: "right" });
      doc.font("Helvetica-Bold").text(formatMoney(line.runningBalance), cols.balance.x, ry, { width: cols.balance.w - 4, align: "right" });

      y += ROW_H;
    }

    // Linha de totais
    doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(lineGray).lineWidth(0.5).stroke();
    y += 6;
    doc.fontSize(8).fillColor(dark).font("Helvetica-Bold");
    doc.text("TOTAIS:", cols.doc.x, y, { width: cols.doc.w });
    doc.text(formatMoney(data.totalInvoiced), cols.invoiced.x, y, { width: cols.invoiced.w, align: "right" });
    doc.text(formatMoney(data.totalMovement - data.totalInvoiced), cols.credit.x, y, { width: cols.credit.w, align: "right" });
    doc.text(formatMoney(data.finalBalance), cols.balance.x, y, { width: cols.balance.w - 4, align: "right" });
    y += 24;

    // ── Conferência / nota explicativa ────────────────────────────────────────
    if (y > doc.page.height - 140) {
      doc.addPage();
      y = 40;
    }

    const hasSettlementLine = data.lines.some((l) => l.kind === "settlement");
    const conferenceParts = [
      `Conferência: ${data.documentCounts.invoices} fatura(s) + ${data.documentCounts.creditNotes} nota(s) de crédito`,
      `Saldo documental líquido antes da conciliação: ${formatMoney(data.netDocumentBalanceBeforeSettlement)}`,
      `Saldo final: ${formatMoney(data.finalBalance)}`,
    ];
    doc.rect(40, y, 3, hasSettlementLine ? 60 : 24).fill(accent);
    doc.fontSize(8).fillColor(dark).font("Helvetica-Bold")
      .text(conferenceParts.join(" | "), 52, y, { width: pageWidth - 20 });

    if (hasSettlementLine) {
      y += 24;
      doc.fontSize(8).fillColor(dark).font("Helvetica-Bold").text("Nota: ", 52, y, { continued: true, width: pageWidth - 20 })
        .font("Helvetica").fillColor(gray)
        .text(
          "O extrato de origem indica todos os documentos como liquidados, mas não discrimina as datas nem os valores dos pagamentos. " +
          "A liquidação apresentada acima corresponde à conciliação matemática entre faturas, notas de crédito e o saldo final informado.",
        );
    }

    // ── Rodapé (todas as páginas, com numeração) ─────────────────────────────
    // Desativa temporariamente a margem inferior: escrever tão perto do fundo
    // da página faz o pdfkit disparar uma quebra de página automática por
    // conta própria (mesmo com x/y explícitos), criando páginas em branco.
    const range = doc.bufferedPageRange();
    const savedBottomMargin = doc.page.margins.bottom;
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      const footerY = doc.page.height - 40;
      doc.moveTo(40, footerY - 10).lineTo(40 + pageWidth, footerY - 10).strokeColor(lineGray).lineWidth(0.5).stroke();
      doc.fontSize(7).fillColor(gray).font("Helvetica")
        .text(
          `${organization.name || "—"} NIF ${organization.nif || "—"} • Documento de conferência de conta corrente`,
          40,
          footerY - 4,
          { width: pageWidth / 2, lineBreak: false },
        );
      doc.text(`Página ${i - range.start + 1} de ${range.count}`, 40 + pageWidth / 2, footerY - 4, { width: pageWidth / 2, align: "right", lineBreak: false });
      doc.page.margins.bottom = savedBottomMargin;
    }

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
    private readonly getOrganizationIdentity: GetOrganizationIdentityPort,
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
        const command: Parameters<typeof this.listCostCenterGroups.execute>[0] = {
          organizationId: req.auth!.orgId,
        };
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
        const result = await this.getCostCenterGroup.execute({
          organizationId: req.auth!.orgId,
          id: req.params["id"] as string,
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
          organizationId: req.auth!.orgId,
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
          organizationId: req.auth!.orgId,
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
          organizationId: req.auth!.orgId,
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
        const command: Parameters<typeof this.listCostCenterCategories.execute>[0] = {
          organizationId: req.auth!.orgId,
        };
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
          organizationId: req.auth!.orgId,
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
          organizationId: req.auth!.orgId,
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
          organizationId: req.auth!.orgId,
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
          organizationId: req.auth!.orgId,
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
    this.router.post("/financial-base/cost-centers/seed", async (req, res) => {
      try {
        const result = await this.seedDefaultCostCenters.execute(req.auth!.orgId);
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
        const results = await this.listChannels.execute(req.auth!.orgId, filter);
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
        const organizationId = req.auth!.orgId;

        if (includeStats === "true") {
          const command: Parameters<typeof this.listSuppliersWithStats.execute>[0] = { organizationId };
          if (status === "active" || status === "inactive") command.status = status;
          if (search) command.search = search;
          const results = await this.listSuppliersWithStats.execute(command);
          res.json(results);
          return;
        }

        const command: Parameters<typeof this.listSuppliers.execute>[0] = { organizationId };
        if (status === "active" || status === "inactive") command.status = status;
        if (search) command.search = search;
        const results = await this.listSuppliers.execute(command);
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
    this.router.get("/financial-base/suppliers/kpis", async (req, res) => {
      try {
        const result = await this.getSuppliersKpis.execute(req.auth!.orgId);
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
          organizationId: req.auth!.orgId,
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
     * Query: startDate? (YYYY-MM-DD), endDate? (YYYY-MM-DD),
     *        openingBalance? (euros), informedFinalBalance? (euros)
     * Devolve application/pdf com o extrato de conta corrente do fornecedor.
     */
    this.router.get("/financial-base/suppliers/:id/statement-pdf", async (req, res) => {
      try {
        const { startDate: startStr, endDate: endStr, openingBalance: openingStr, informedFinalBalance: informedStr } =
          req.query as Record<string, string | undefined>;
        const organizationId = req.auth!.orgId;

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

        let openingBalance: number | undefined;
        if (openingStr !== undefined && openingStr !== "") {
          openingBalance = parseFloat(openingStr);
          if (isNaN(openingBalance)) {
            res.status(400).json({ error: "openingBalance inválido (usa um número, ex: 150.50)" });
            return;
          }
        }

        let informedFinalBalance: number | undefined;
        if (informedStr !== undefined && informedStr !== "") {
          informedFinalBalance = parseFloat(informedStr);
          if (isNaN(informedFinalBalance)) {
            res.status(400).json({ error: "informedFinalBalance inválido (usa um número, ex: 0)" });
            return;
          }
        }

        const [data, organization] = await Promise.all([
          this.getSupplierStatement.execute({
            organizationId,
            id: req.params["id"] as string,
            ...(startDate && { startDate }),
            ...(endDate && { endDate }),
            ...(openingBalance !== undefined && { openingBalance }),
            ...(informedFinalBalance !== undefined && { informedFinalBalance }),
          }),
          this.getOrganizationIdentity.execute({ organizationId }),
        ]);

        const pdf = await buildStatementPdf(data, organization);

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
        const result = await this.getSupplier.execute({
          organizationId: req.auth!.orgId,
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
          organizationId: req.auth!.orgId,
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
          organizationId: req.auth!.orgId,
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
          organizationId: req.auth!.orgId,
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

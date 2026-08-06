import { Router } from "express";
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
import type { ListChannelsPort } from "../../domain/ports/in/channel.ports.js";

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
     * Query: status?, search?
     */
    this.router.get("/financial-base/suppliers", async (req, res) => {
      try {
        const { status, search } = req.query as Record<string, string | undefined>;
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

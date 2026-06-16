import { Router } from "express";
import {
  CostCenterNotFoundError,
  CostCenterCodeAlreadyExistsError,
  SupplierNotFoundError,
} from "../../domain/errors.js";
import {
  COST_CENTER_CATEGORIES,
  type CostCenterCategory,
} from "../../domain/entities/cost-center.js";
import type { CostCenterFilter } from "../../domain/ports/out/cost-center-repository.port.js";
import type { SupplierFilter } from "../../domain/ports/out/supplier-repository.port.js";
import type { CreateCostCenterPort } from "../../domain/ports/in/cost-center.ports.js";
import type { UpdateCostCenterPort } from "../../domain/ports/in/cost-center.ports.js";
import type { ToggleCostCenterStatusPort } from "../../domain/ports/in/cost-center.ports.js";
import type { ListCostCentersPort } from "../../domain/ports/in/cost-center.ports.js";
import type { GetCostCenterPort } from "../../domain/ports/in/cost-center.ports.js";
import type { CreateSupplierPort } from "../../domain/ports/in/supplier.ports.js";
import type { UpdateSupplierPort } from "../../domain/ports/in/supplier.ports.js";
import type { ToggleSupplierStatusPort } from "../../domain/ports/in/supplier.ports.js";
import type { ListSuppliersPort } from "../../domain/ports/in/supplier.ports.js";
import type { GetSupplierPort } from "../../domain/ports/in/supplier.ports.js";

export class FinancialBaseController {
  readonly router: Router;

  constructor(
    private readonly createCostCenter: CreateCostCenterPort,
    private readonly updateCostCenter: UpdateCostCenterPort,
    private readonly toggleCostCenterStatus: ToggleCostCenterStatusPort,
    private readonly listCostCenters: ListCostCentersPort,
    private readonly getCostCenter: GetCostCenterPort,
    private readonly createSupplier: CreateSupplierPort,
    private readonly updateSupplier: UpdateSupplierPort,
    private readonly toggleSupplierStatus: ToggleSupplierStatusPort,
    private readonly listSuppliers: ListSuppliersPort,
    private readonly getSupplier: GetSupplierPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    // ── Cost Centers ────────────────────────────────────────────────────────

    /**
     * GET /financial-base/cost-centers
     * Query: category?, status?
     */
    this.router.get("/financial-base/cost-centers", async (req, res) => {
      try {
        const { category, status } = req.query as Record<string, string | undefined>;
        const filter: Parameters<typeof this.listCostCenters.execute>[0] = {};
        if (category) filter.category = category;
        if (status === "active" || status === "inactive") filter.status = status;
        const results = await this.listCostCenters.execute(filter);
        res.json(results);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * GET /financial-base/cost-centers/categories
     * Lista as categorias válidas (útil para selects no frontend).
     */
    this.router.get("/financial-base/cost-centers/categories", (_req, res) => {
      res.json(COST_CENTER_CATEGORIES);
    });

    /**
     * GET /financial-base/cost-centers/:id
     */
    this.router.get("/financial-base/cost-centers/:id", async (req, res) => {
      try {
        const result = await this.getCostCenter.execute({ id: req.params["id"] as string });
        res.json(result);
      } catch (e) {
        if (e instanceof CostCenterNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * POST /financial-base/cost-centers
     * Body: { code, name, category, subcategory?, description?, responsibleName? }
     */
    this.router.post("/financial-base/cost-centers", async (req, res) => {
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
        if (!COST_CENTER_CATEGORIES.includes(body.category as never)) {
          res.status(400).json({ error: "category inválida" });
          return;
        }
        const result = await this.createCostCenter.execute({
          code: body.code as string,
          name: body.name as string,
          category: body.category as CostCenterCategory,
          subcategory: (body.subcategory as string | null | undefined) ?? null,
          description: (body.description as string | null | undefined) ?? null,
          responsibleName: (body.responsibleName as string | null | undefined) ?? null,
        });
        res.status(201).json(result);
      } catch (e) {
        if (e instanceof CostCenterCodeAlreadyExistsError) {
          res.status(409).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * PATCH /financial-base/cost-centers/:id
     * Body: { name?, category?, subcategory?, description?, responsibleName? }
     */
    this.router.patch("/financial-base/cost-centers/:id", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const data: Parameters<typeof this.updateCostCenter.execute>[0]["data"] = {};
        if (body.name !== undefined) data.name = body.name as string;
        if (body.category !== undefined) data.category = body.category as CostCenterCategory;
        if ("subcategory" in body) data.subcategory = (body.subcategory as string | null) ?? null;
        if ("description" in body) data.description = (body.description as string | null) ?? null;
        if ("responsibleName" in body) data.responsibleName = (body.responsibleName as string | null) ?? null;
        const result = await this.updateCostCenter.execute({
          id: req.params["id"] as string,
          data,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof CostCenterNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * PATCH /financial-base/cost-centers/:id/status
     * Body: { status: "active" | "inactive" }
     */
    this.router.patch("/financial-base/cost-centers/:id/status", async (req, res) => {
      try {
        const body = req.body as { status?: unknown };
        if (body.status !== "active" && body.status !== "inactive") {
          res.status(400).json({ error: "status deve ser 'active' ou 'inactive'" });
          return;
        }
        const result = await this.toggleCostCenterStatus.execute({
          id: req.params["id"] as string,
          status: body.status,
        });
        res.json(result);
      } catch (e) {
        if (e instanceof CostCenterNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
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
        const filter: Parameters<typeof this.listSuppliers.execute>[0] = {};
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
     * Body: { name, nif?, email?, phone?, address?, iban?, defaultCostCenterId?, paymentTermsDays?, notes? }
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
          defaultCostCenterId: (body.defaultCostCenterId as string | null | undefined) ?? null,
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
        if ("defaultCostCenterId" in body)
          data.defaultCostCenterId = (body.defaultCostCenterId as string | null) ?? null;
        if ("paymentTermsDays" in body)
          data.paymentTermsDays = body.paymentTermsDays != null ? Number(body.paymentTermsDays) : null;
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

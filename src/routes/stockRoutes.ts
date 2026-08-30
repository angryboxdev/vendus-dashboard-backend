import { Router } from "express";
import type { Request, Response } from "express";
import type {
  ListStockMovementsQuery,
  StockCategoryCreateBody,
  StockCategoryUpdateBody,
  StockItemCreateBody,
  StockItemUpdateBody,
  StockMovementCreateBody,
  StockMovementUpdateBody,
  StockItemType,
} from "../domain/stockTypes.js";
import {
  createStockCategory,
  deleteStockCategory,
  getStockCategory,
  listStockCategories,
  updateStockCategory,
} from "../services/stockCategoryService.js";
import {
  createStockItem,
  deleteStockItem,
  getStockItem,
  listStockItems,
  updateStockItem,
  validateBaseUnit,
  validateItemType,
} from "../services/stockItemService.js";
import {
  createStockMovement,
  getStockMovementById,
  listStockMovementsByItem,
  listStockMovementsPaginated,
  updateStockMovement,
  validateMovementType,
} from "../services/stockMovementService.js";

export const stockRoutes = Router();

function toQueryRecord(q: Request["query"]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(q ?? {})) {
    out[k] = Array.isArray(v) ? (v[0] as string) : (v as string);
  }
  return out;
}

// ---------- Categories ----------
stockRoutes.get("/stock/categories", async (req, res) => {
  try {
    const list = await listStockCategories(req.auth!.orgId);
    res.json(list);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao listar categorias";
    res.status(500).json({ error: message });
  }
});

stockRoutes.get("/stock/categories/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "id obrigatório" });
      return;
    }
    const category = await getStockCategory(req.auth!.orgId, id);
    if (!category) {
      res.status(404).json({ error: "Categoria não encontrada" });
      return;
    }
    res.json(category);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao obter categoria";
    res.status(500).json({ error: message });
  }
});

stockRoutes.post("/stock/categories", async (req, res) => {
  try {
    const body = req.body as StockCategoryCreateBody;
    if (!body?.name || typeof body.name !== "string") {
      res.status(400).json({ error: "name é obrigatório" });
      return;
    }
    const category = await createStockCategory(req.auth!.orgId, body);
    res.status(201).json(category);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao criar categoria";
    res.status(500).json({ error: message });
  }
});

stockRoutes.put("/stock/categories/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "id obrigatório" });
      return;
    }
    const body = req.body as StockCategoryUpdateBody;
    if (!body?.name || typeof body.name !== "string") {
      res.status(400).json({ error: "name é obrigatório" });
      return;
    }
    const category = await updateStockCategory(req.auth!.orgId, id, body);
    res.json(category);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao atualizar categoria";
    res.status(500).json({ error: message });
  }
});

stockRoutes.delete("/stock/categories/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "id obrigatório" });
      return;
    }
    await deleteStockCategory(req.auth!.orgId, id);
    res.status(204).send();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao eliminar categoria";
    res.status(500).json({ error: message });
  }
});

// ---------- Items ----------
stockRoutes.get("/stock/items", async (req, res) => {
  try {
    const q = toQueryRecord(req.query);
    const filters: { category_id?: string; type?: StockItemType; is_active?: boolean } = {};
    if (q.category_id) filters.category_id = q.category_id;
    if (q.type && validateItemType(q.type)) filters.type = q.type;
    if (q.is_active !== undefined) filters.is_active = q.is_active === "true";
    const list = await listStockItems(
      req.auth!.orgId,
      Object.keys(filters).length ? filters : undefined
    );
    res.json(list);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao listar itens";
    res.status(500).json({ error: message });
  }
});

stockRoutes.get("/stock/items/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "id obrigatório" });
      return;
    }
    const item = await getStockItem(req.auth!.orgId, id);
    if (!item) {
      res.status(404).json({ error: "Item não encontrado" });
      return;
    }
    res.json(item);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao obter item";
    res.status(500).json({ error: message });
  }
});

stockRoutes.post("/stock/items", async (req, res) => {
  try {
    const body = req.body as StockItemCreateBody;
    if (!body?.name || typeof body.name !== "string") {
      res.status(400).json({ error: "name é obrigatório" });
      return;
    }
    if (!body.category_id) {
      res.status(400).json({ error: "category_id é obrigatório" });
      return;
    }
    if (!body.type || !validateItemType(body.type)) {
      res.status(400).json({ error: "type inválido (ingredient, beverage, packaging, cleaning, other)" });
      return;
    }
    if (!body.base_unit || !validateBaseUnit(body.base_unit)) {
      res.status(400).json({ error: "base_unit inválido (g, kg, ml, l, un)" });
      return;
    }
    const item = await createStockItem(req.auth!.orgId, body);
    res.status(201).json(item);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao criar item";
    res.status(500).json({ error: message });
  }
});

stockRoutes.put("/stock/items/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "id obrigatório" });
      return;
    }
    const body = req.body as StockItemUpdateBody;
    if (body.type != null && !validateItemType(body.type)) {
      res.status(400).json({ error: "type inválido" });
      return;
    }
    if (body.base_unit != null && !validateBaseUnit(body.base_unit)) {
      res.status(400).json({ error: "base_unit inválido" });
      return;
    }
    const item = await updateStockItem(req.auth!.orgId, id, body);
    res.json(item);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao atualizar item";
    res.status(500).json({ error: message });
  }
});

stockRoutes.delete("/stock/items/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "id obrigatório" });
      return;
    }
    await deleteStockItem(req.auth!.orgId, id);
    res.status(204).send();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao eliminar item";
    res.status(500).json({ error: message });
  }
});

// ---------- Movements ----------
/**
 * Histórico global com paginação (antes de GET /stock/movements/:id).
 * GET /stock/movements?page=1&page_size=20&item_id=&category_id=&type=&date_from=&date_to=
 */
stockRoutes.get("/stock/movements", async (req, res) => {
  try {
    const q = toQueryRecord(req.query);
    const page = q.page != null ? Number(q.page) : undefined;
    const page_size = q.page_size != null ? Number(q.page_size) : undefined;
    if (page != null && (!Number.isFinite(page) || page < 1)) {
      res.status(400).json({ error: "page inválido (>= 1)" });
      return;
    }
    if (
      page_size != null &&
      (!Number.isFinite(page_size) || page_size < 1 || page_size > 100)
    ) {
      res.status(400).json({ error: "page_size inválido (1–100)" });
      return;
    }
    if (q.type != null && q.type !== "" && !validateMovementType(q.type)) {
      res.status(400).json({
        error:
          "type inválido (purchase, consumption, sale, loss, adjustment, transfer)",
      });
      return;
    }

    const filters: ListStockMovementsQuery = {
      ...(page != null ? { page } : {}),
      ...(page_size != null ? { page_size } : {}),
      ...(q.item_id ? { item_id: q.item_id } : {}),
      ...(q.category_id ? { category_id: q.category_id } : {}),
      ...(q.type && validateMovementType(q.type) ? { type: q.type } : {}),
      ...(q.date_from ? { date_from: q.date_from } : {}),
      ...(q.date_to ? { date_to: q.date_to } : {}),
    };

    const payload = await listStockMovementsPaginated(req.auth!.orgId, filters);
    res.json(payload);
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Erro ao listar histórico de movimentos";
    const status = /inválido/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

stockRoutes.post("/stock/movements", async (req, res) => {
  try {
    const body = req.body as StockMovementCreateBody;
    if (!body?.item_id) {
      res.status(400).json({ error: "item_id é obrigatório" });
      return;
    }
    if (!body.type || !validateMovementType(body.type)) {
      res.status(400).json({
        error: "type inválido (purchase, consumption, sale, loss, adjustment, transfer)",
      });
      return;
    }
    if (!body.location_id) {
      res.status(400).json({ error: "location_id é obrigatório" });
      return;
    }
    const movement = await createStockMovement(req.auth!.orgId, body);
    res.status(201).json(movement);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao criar movimentação";
    res.status(500).json({ error: message });
  }
});

stockRoutes.put("/stock/movements/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "id da movimentação é obrigatório" });
      return;
    }
    const body = req.body as StockMovementUpdateBody;
    const movement = await updateStockMovement(req.auth!.orgId, id, body ?? {});
    res.json(movement);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao atualizar movimentação";
    res.status(500).json({ error: message });
  }
});

stockRoutes.get("/stock/movements/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "id é obrigatório" });
      return;
    }
    const movement = await getStockMovementById(req.auth!.orgId, id);
    if (!movement) {
      res.status(404).json({ error: "Movimentação não encontrada" });
      return;
    }
    res.json(movement);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao obter movimentação";
    res.status(500).json({ error: message });
  }
});

stockRoutes.get("/stock/items/:id/movements", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "id obrigatório" });
      return;
    }
    const q = toQueryRecord(req.query);
    const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500);
    const list = await listStockMovementsByItem(req.auth!.orgId, id, limit);
    res.json(list);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao listar movimentações";
    res.status(500).json({ error: message });
  }
});

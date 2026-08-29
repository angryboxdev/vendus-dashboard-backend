import { Router } from "express";
import type {
  PreparationCreateBody,
  PreparationUpdateBody,
  PreparationItemCreateBody,
  PreparationItemUpdateBody,
} from "../domain/preparationTypes.js";
import {
  listPreparations,
  getPreparation,
  createPreparation,
  updatePreparation,
  deletePreparation,
  listPreparationItems,
  createPreparationItem,
  updatePreparationItem,
  deletePreparationItem,
} from "../services/preparationService.js";

export const preparationRoutes = Router();

// ---------- Preparations ----------

preparationRoutes.get("/preparations", async (req, res) => {
  try {
    const list = await listPreparations(req.auth!.orgId);
    res.json(list);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao listar preparos";
    res.status(500).json({ error: message });
  }
});

preparationRoutes.get("/preparations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) { res.status(400).json({ error: "id obrigatório" }); return; }
    const preparation = await getPreparation(req.auth!.orgId, id);
    if (!preparation) { res.status(404).json({ error: "Preparo não encontrado" }); return; }
    const items = await listPreparationItems(req.auth!.orgId, id);
    res.json({ ...preparation, items });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao obter preparo";
    res.status(500).json({ error: message });
  }
});

preparationRoutes.post("/preparations", async (req, res) => {
  try {
    const body = req.body as PreparationCreateBody;
    if (!body?.name?.trim()) {
      res.status(400).json({ error: "name é obrigatório" }); return;
    }
    const yield_qty = Number(body.yield_qty);
    if (!Number.isFinite(yield_qty) || yield_qty <= 0) {
      res.status(400).json({ error: "yield_qty deve ser positivo" }); return;
    }
    if (!body.yield_unit?.trim()) {
      res.status(400).json({ error: "yield_unit é obrigatório" }); return;
    }
    if (body.use_as_unit !== undefined && typeof body.use_as_unit !== "boolean") {
      res.status(400).json({ error: "use_as_unit deve ser booleano" }); return;
    }
    const created = await createPreparation(req.auth!.orgId, body);
    res.status(201).json(created);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao criar preparo";
    res.status(500).json({ error: message });
  }
});

preparationRoutes.put("/preparations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) { res.status(400).json({ error: "id obrigatório" }); return; }
    const body = req.body as PreparationUpdateBody;
    if (body.use_as_unit !== undefined && typeof body.use_as_unit !== "boolean") {
      res.status(400).json({ error: "use_as_unit deve ser booleano" }); return;
    }
    const updated = await updatePreparation(req.auth!.orgId, id, body);
    res.json(updated);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao atualizar preparo";
    res.status(500).json({ error: message });
  }
});

preparationRoutes.delete("/preparations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) { res.status(400).json({ error: "id obrigatório" }); return; }
    await deletePreparation(req.auth!.orgId, id);
    res.status(204).send();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao eliminar preparo";
    const status = e instanceof Error && e.message.includes("está a ser usado") ? 409 : 500;
    res.status(status).json({ error: message });
  }
});

// ---------- Preparation Items ----------

preparationRoutes.get("/preparations/:id/items", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) { res.status(400).json({ error: "id obrigatório" }); return; }
    const items = await listPreparationItems(req.auth!.orgId, id);
    res.json(items);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao listar ingredientes";
    res.status(500).json({ error: message });
  }
});

preparationRoutes.post("/preparations/:id/items", async (req, res) => {
  try {
    const { id: preparation_id } = req.params;
    if (!preparation_id) { res.status(400).json({ error: "id obrigatório" }); return; }
    const body = req.body as Omit<PreparationItemCreateBody, "preparation_id">;
    if (!body?.stock_item_id) {
      res.status(400).json({ error: "stock_item_id é obrigatório" }); return;
    }
    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      res.status(400).json({ error: "quantity deve ser positivo" }); return;
    }
    const created = await createPreparationItem(req.auth!.orgId, {
      preparation_id,
      stock_item_id: body.stock_item_id,
      quantity,
    });
    res.status(201).json(created);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao adicionar ingrediente";
    res.status(500).json({ error: message });
  }
});

preparationRoutes.put("/preparations/:id/items/:itemId", async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!itemId) { res.status(400).json({ error: "itemId obrigatório" }); return; }
    const body = req.body as PreparationItemUpdateBody;
    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      res.status(400).json({ error: "quantity deve ser positivo" }); return;
    }
    const updated = await updatePreparationItem(req.auth!.orgId, itemId, { quantity });
    res.json(updated);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao atualizar ingrediente";
    res.status(500).json({ error: message });
  }
});

preparationRoutes.delete("/preparations/:id/items/:itemId", async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!itemId) { res.status(400).json({ error: "itemId obrigatório" }); return; }
    await deletePreparationItem(req.auth!.orgId, itemId);
    res.status(204).send();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao remover ingrediente";
    res.status(500).json({ error: message });
  }
});

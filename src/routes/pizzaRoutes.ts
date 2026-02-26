import { Router } from "express";
import type { Request } from "express";
import type {
  PizzaCreateBody,
  PizzaUpdateBody,
  PizzaPriceCreateBody,
  PizzaPriceUpdateBody,
  PizzaRecipeCreateBody,
  PizzaRecipeUpdateBody,
  PizzaRecipeItemCreateBody,
  PizzaRecipeItemUpdateBody,
  PizzaCategory,
} from "../domain/pizzaTypes.js";
import {
  createPizza,
  deletePizza,
  getPizza,
  listPizzas,
  updatePizza,
  validatePizzaCategory,
} from "../services/pizzaService.js";
import {
  createPizzaPrice,
  deletePizzaPrice,
  listPizzaPrices,
  updatePizzaPrice,
  validatePizzaSize,
} from "../services/pizzaPriceService.js";
import {
  createPizzaRecipe,
  deletePizzaRecipe,
  listPizzaRecipes,
  getPizzaRecipe,
  updatePizzaRecipe,
  setActivePizzaRecipe,
} from "../services/pizzaRecipeService.js";
import {
  createPizzaRecipeItem,
  deletePizzaRecipeItem,
  listPizzaRecipeItems,
  getPizzaRecipeItem,
  updatePizzaRecipeItem,
} from "../services/pizzaRecipeItemService.js";

export const pizzaRoutes = Router();

function toQueryRecord(q: Request["query"]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(q ?? {})) {
    out[k] = Array.isArray(v) ? (v[0] as string) : (v as string);
  }
  return out;
}

// ---------- Pizzas ----------
pizzaRoutes.get("/pizzas", async (req, res) => {
  try {
    const q = toQueryRecord(req.query);
    const filters: { category?: PizzaCategory; is_active?: boolean } = {};
    if (q.category && validatePizzaCategory(q.category)) filters.category = q.category;
    if (q.is_active !== undefined) filters.is_active = q.is_active === "true";
    const list = await listPizzas(Object.keys(filters).length ? filters : undefined);
    res.json(list);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao listar pizzas";
    res.status(500).json({ error: message });
  }
});

pizzaRoutes.get("/pizzas/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "id obrigatório" });
      return;
    }
    const pizza = await getPizza(id);
    if (!pizza) {
      res.status(404).json({ error: "Pizza não encontrada" });
      return;
    }
    res.json(pizza);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao obter pizza";
    res.status(500).json({ error: message });
  }
});

pizzaRoutes.post("/pizzas", async (req, res) => {
  try {
    const body = req.body as PizzaCreateBody;
    if (!body?.name || typeof body.name !== "string") {
      res.status(400).json({ error: "name é obrigatório" });
      return;
    }
    if (!body.category || !validatePizzaCategory(body.category)) {
      res.status(400).json({ error: "category inválida (classics, specials, sweeties)" });
      return;
    }
    const pizza = await createPizza(body);
    res.status(201).json(pizza);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao criar pizza";
    res.status(500).json({ error: message });
  }
});

pizzaRoutes.put("/pizzas/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "id obrigatório" });
      return;
    }
    const body = req.body as PizzaUpdateBody;
    if (body.category != null && !validatePizzaCategory(body.category)) {
      res.status(400).json({ error: "category inválida" });
      return;
    }
    const pizza = await updatePizza(id, body);
    res.json(pizza);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao atualizar pizza";
    res.status(500).json({ error: message });
  }
});

pizzaRoutes.delete("/pizzas/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "id obrigatório" });
      return;
    }
    await deletePizza(id);
    res.status(204).send();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao eliminar pizza";
    res.status(500).json({ error: message });
  }
});

// ---------- Preços (por pizza) ----------
pizzaRoutes.get("/pizzas/:pizzaId/prices", async (req, res) => {
  try {
    const pizzaId = req.params.pizzaId;
    if (!pizzaId) {
      res.status(400).json({ error: "pizzaId obrigatório" });
      return;
    }
    const list = await listPizzaPrices(pizzaId);
    res.json(list);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao listar preços";
    res.status(500).json({ error: message });
  }
});

pizzaRoutes.post("/pizzas/:pizzaId/prices", async (req, res) => {
  try {
    const pizzaId = req.params.pizzaId;
    if (!pizzaId) {
      res.status(400).json({ error: "pizzaId obrigatório" });
      return;
    }
    const body = req.body as Omit<PizzaPriceCreateBody, "pizza_id">;
    if (!body?.size || !validatePizzaSize(body.size)) {
      res.status(400).json({ error: "size inválido (small, large)" });
      return;
    }
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) {
      res.status(400).json({ error: "price inválido" });
      return;
    }
    const created = await createPizzaPrice({ pizza_id: pizzaId, size: body.size, price });
    res.status(201).json(created);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao criar preço";
    res.status(500).json({ error: message });
  }
});

pizzaRoutes.put("/pizzas/:pizzaId/prices/:priceId", async (req, res) => {
  try {
    const priceId = req.params.priceId;
    if (!priceId) {
      res.status(400).json({ error: "priceId obrigatório" });
      return;
    }
    const body = req.body as PizzaPriceUpdateBody;
    const updated = await updatePizzaPrice(priceId, body);
    res.json(updated);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao atualizar preço";
    res.status(500).json({ error: message });
  }
});

pizzaRoutes.delete("/pizzas/:pizzaId/prices/:priceId", async (req, res) => {
  try {
    const priceId = req.params.priceId;
    if (!priceId) {
      res.status(400).json({ error: "priceId obrigatório" });
      return;
    }
    await deletePizzaPrice(priceId);
    res.status(204).send();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao eliminar preço";
    res.status(500).json({ error: message });
  }
});

// ---------- Receitas (por pizza) ----------
pizzaRoutes.get("/pizzas/:pizzaId/recipes", async (req, res) => {
  try {
    const pizzaId = req.params.pizzaId;
    if (!pizzaId) {
      res.status(400).json({ error: "pizzaId obrigatório" });
      return;
    }
    const list = await listPizzaRecipes(pizzaId);
    res.json(list);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao listar receitas";
    res.status(500).json({ error: message });
  }
});

pizzaRoutes.post("/pizzas/:pizzaId/recipes", async (req, res) => {
  try {
    const pizzaId = req.params.pizzaId;
    if (!pizzaId) {
      res.status(400).json({ error: "pizzaId obrigatório" });
      return;
    }
    const body = req.body as Omit<PizzaRecipeCreateBody, "pizza_id">;
    const created = await createPizzaRecipe({ pizza_id: pizzaId, ...body });
    res.status(201).json(created);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao criar receita";
    res.status(500).json({ error: message });
  }
});

pizzaRoutes.get("/pizzas/:pizzaId/recipes/:recipeId", async (req, res) => {
  try {
    const recipeId = req.params.recipeId;
    if (!recipeId) {
      res.status(400).json({ error: "recipeId obrigatório" });
      return;
    }
    const recipe = await getPizzaRecipe(recipeId);
    if (!recipe) {
      res.status(404).json({ error: "Receita não encontrada" });
      return;
    }
    res.json(recipe);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao obter receita";
    res.status(500).json({ error: message });
  }
});

pizzaRoutes.put("/pizzas/:pizzaId/recipes/:recipeId", async (req, res) => {
  try {
    const recipeId = req.params.recipeId;
    if (!recipeId) {
      res.status(400).json({ error: "recipeId obrigatório" });
      return;
    }
    const body = req.body as PizzaRecipeUpdateBody;
    const updated = await updatePizzaRecipe(recipeId, body);
    res.json(updated);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao atualizar receita";
    res.status(500).json({ error: message });
  }
});

pizzaRoutes.post("/pizzas/:pizzaId/recipes/:recipeId/activate", async (req, res) => {
  try {
    const pizzaId = req.params.pizzaId;
    const recipeId = req.params.recipeId;
    if (!pizzaId || !recipeId) {
      res.status(400).json({ error: "pizzaId e recipeId obrigatórios" });
      return;
    }
    const recipe = await setActivePizzaRecipe(pizzaId, recipeId);
    res.json(recipe);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao ativar receita";
    res.status(500).json({ error: message });
  }
});

pizzaRoutes.delete("/pizzas/:pizzaId/recipes/:recipeId", async (req, res) => {
  try {
    const recipeId = req.params.recipeId;
    if (!recipeId) {
      res.status(400).json({ error: "recipeId obrigatório" });
      return;
    }
    await deletePizzaRecipe(recipeId);
    res.status(204).send();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao eliminar receita";
    res.status(500).json({ error: message });
  }
});

// ---------- Itens da receita ----------
pizzaRoutes.get("/pizzas/:pizzaId/recipes/:recipeId/items", async (req, res) => {
  try {
    const recipeId = req.params.recipeId;
    if (!recipeId) {
      res.status(400).json({ error: "recipeId obrigatório" });
      return;
    }
    const list = await listPizzaRecipeItems(recipeId);
    res.json(list);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao listar itens da receita";
    res.status(500).json({ error: message });
  }
});

pizzaRoutes.post("/pizzas/:pizzaId/recipes/:recipeId/items", async (req, res) => {
  try {
    const recipeId = req.params.recipeId;
    if (!recipeId) {
      res.status(400).json({ error: "recipeId obrigatório" });
      return;
    }
    const body = req.body as Omit<PizzaRecipeItemCreateBody, "recipe_id">;
    if (!body?.stock_item_id) {
      res.status(400).json({ error: "stock_item_id é obrigatório" });
      return;
    }
    if (!body?.size || !validatePizzaSize(body.size)) {
      res.status(400).json({ error: "size inválido (small, large)" });
      return;
    }
    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      res.status(400).json({ error: "quantity deve ser positivo" });
      return;
    }
    const created = await createPizzaRecipeItem({ recipe_id: recipeId, ...body });
    res.status(201).json(created);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao criar item da receita";
    res.status(500).json({ error: message });
  }
});

pizzaRoutes.put("/pizzas/:pizzaId/recipes/:recipeId/items/:itemId", async (req, res) => {
  try {
    const itemId = req.params.itemId;
    if (!itemId) {
      res.status(400).json({ error: "itemId obrigatório" });
      return;
    }
    const body = req.body as PizzaRecipeItemUpdateBody;
    const updated = await updatePizzaRecipeItem(itemId, body);
    res.json(updated);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao atualizar item da receita";
    res.status(500).json({ error: message });
  }
});

pizzaRoutes.delete("/pizzas/:pizzaId/recipes/:recipeId/items/:itemId", async (req, res) => {
  try {
    const itemId = req.params.itemId;
    if (!itemId) {
      res.status(400).json({ error: "itemId obrigatório" });
      return;
    }
    await deletePizzaRecipeItem(itemId);
    res.status(204).send();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao eliminar item da receita";
    res.status(500).json({ error: message });
  }
});

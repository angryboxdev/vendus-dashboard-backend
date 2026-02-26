# API Pizzas – Guia para o Frontend

Base URL: **`/api`** (ex.: `GET http://localhost:3000/api/pizzas`).

Todas as respostas de erro têm a forma: `{ "error": "string" }`. Códigos comuns: `400` (validação), `404` (não encontrado), `500` (erro interno).

---

## Enums / literais

| Tipo              | Valores                                      |
| ----------------- | -------------------------------------------- |
| **PizzaCategory** | `"classics"` \| `"specials"` \| `"sweeties"` |
| **PizzaSize**     | `"small"` \| `"large"`                       |

---

## 1. Pizzas

### Listar pizzas

`GET /api/pizzas`

**Query (opcional):**

- `category` — filtrar por categoria (`classics` \| `specials` \| `sweeties`)
- `is_active` — `true` \| `false`

**Resposta 200:** array de `Pizza`

```ts
interface Pizza {
  id: string;
  name: string;
  description: string;
  category: "classics" | "specials" | "sweeties";
  is_active: boolean;
  created_at?: string; // ISO
  updated_at?: string;
}
```

---

### Obter uma pizza

`GET /api/pizzas/:id`

**Resposta 200:** `Pizza`  
**Resposta 404:** `{ "error": "Pizza não encontrada" }`

---

### Criar pizza

`POST /api/pizzas`

**Body:**

```ts
{
  name: string;           // obrigatório
  category: "classics" | "specials" | "sweeties";  // obrigatório
  description?: string;    // opcional, default ""
  is_active?: boolean;    // opcional, default true
}
```

**Resposta 201:** `Pizza`

---

### Atualizar pizza

`PUT /api/pizzas/:id`

**Body (todos opcionais):**

```ts
{
  name?: string;
  description?: string;
  category?: "classics" | "specials" | "sweeties";
  is_active?: boolean;
}
```

**Resposta 200:** `Pizza`

---

### Eliminar pizza

`DELETE /api/pizzas/:id`

**Resposta 204:** sem body  
(Elimina em cascata preços e receitas.)

---

## 2. Preços (por pizza)

### Listar preços de uma pizza

`GET /api/pizzas/:pizzaId/prices`

**Resposta 200:** array de `PizzaPrice`

```ts
interface PizzaPrice {
  id: string;
  pizza_id: string;
  size: "small" | "large";
  price: number;
  created_at?: string;
  updated_at?: string;
}
```

---

### Criar preço

`POST /api/pizzas/:pizzaId/prices`

**Body:**

```ts
{
  size: "small" | "large"; // obrigatório
  price: number; // obrigatório, >= 0
}
```

**Resposta 201:** `PizzaPrice`

---

### Atualizar preço

`PUT /api/pizzas/:pizzaId/prices/:priceId`

**Body:**

```ts
{ price?: number; }
```

**Resposta 200:** `PizzaPrice`

---

### Eliminar preço

`DELETE /api/pizzas/:pizzaId/prices/:priceId`

**Resposta 204:** sem body

---

## 3. Receitas (por pizza)

### Listar receitas de uma pizza

`GET /api/pizzas/:pizzaId/recipes`

**Resposta 200:** array de `PizzaRecipe`

```ts
interface PizzaRecipe {
  id: string;
  pizza_id: string;
  version: number;
  is_active: boolean;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}
```

---

### Obter uma receita

`GET /api/pizzas/:pizzaId/recipes/:recipeId`

**Resposta 200:** `PizzaRecipe`  
**Resposta 404:** `{ "error": "Receita não encontrada" }`

---

### Criar receita

`POST /api/pizzas/:pizzaId/recipes`

**Body (todos opcionais):**

```ts
{
  version?: number;      // default 1
  is_active?: boolean;   // default true
  notes?: string | null;
}
```

**Resposta 201:** `PizzaRecipe`

---

### Atualizar receita

`PUT /api/pizzas/:pizzaId/recipes/:recipeId`

**Body:**

```ts
{
  version?: number;
  is_active?: boolean;
  notes?: string | null;
}
```

**Resposta 200:** `PizzaRecipe`

---

### Ativar uma receita (desativa as outras da mesma pizza)

`POST /api/pizzas/:pizzaId/recipes/:recipeId/activate`

**Resposta 200:** `PizzaRecipe` (a receita agora ativa)

---

### Eliminar receita

`DELETE /api/pizzas/:pizzaId/recipes/:recipeId`

**Resposta 204:** sem body  
(Elimina itens da receita em cascata.)

---

## 4. Itens da receita (ingredientes)

Cada item é um ingrediente (referência a `stock_items`) por tamanho e quantidade. A quantidade está na **base_unit** do item de stock (ex.: gramas). O backend devolve apenas `stock_item_id`; para mostrar o nome do ingrediente, o frontend deve usar o endpoint de stock (ex.: `GET /api/stock/items` ou item por id) e fazer o match por `id`.

### Listar itens de uma receita

`GET /api/pizzas/:pizzaId/recipes/:recipeId/items`

**Resposta 200:** array de `PizzaRecipeItem`

```ts
interface PizzaRecipeItem {
  id: string;
  recipe_id: string;
  stock_item_id: string; // usar API stock para obter nome/unidade
  size: "small" | "large";
  quantity: number;
  waste_factor: number | null;
  is_optional: boolean;
  created_at?: string;
}
```

---

### Criar item da receita

`POST /api/pizzas/:pizzaId/recipes/:recipeId/items`

**Body:**

```ts
{
  stock_item_id: string;   // UUID do stock_items
  size: "small" | "large";
  quantity: number;       // > 0, na base_unit do stock_item (ex. gramas)
  waste_factor?: number | null;  // ex. 0.05 para 5%
  is_optional?: boolean;   // default false
}
```

**Resposta 201:** `PizzaRecipeItem`

---

### Atualizar item da receita

`PUT /api/pizzas/:pizzaId/recipes/:recipeId/items/:itemId`

**Body:**

```ts
{
  quantity?: number;      // > 0
  waste_factor?: number | null;
  is_optional?: boolean;
}
```

**Resposta 200:** `PizzaRecipeItem`

---

### Eliminar item da receita

`DELETE /api/pizzas/:pizzaId/recipes/:recipeId/items/:itemId`

**Resposta 204:** sem body

---

## Fluxo sugerido no frontend

1. **Listagem / cardápio**

   - `GET /api/pizzas?is_active=true` (opcional: `?category=classics`).
   - Para cada pizza, `GET /api/pizzas/:pizzaId/prices` para mostrar preços small/large.

2. **Detalhe / edição de uma pizza**

   - `GET /api/pizzas/:id`.
   - `GET /api/pizzas/:id/prices`.
   - `GET /api/pizzas/:id/recipes` → escolher a receita ativa (`is_active === true`).
   - `GET /api/pizzas/:id/recipes/:recipeId/items`.
   - Resolver `stock_item_id` com a API de stock para exibir nome e unidade dos ingredientes.

3. **CRUD**
   - Criar/editar pizza → depois preços e receita (e itens da receita).
   - Ingredientes da receita vêm de `GET /api/stock/items` (ou equivalente) para preencher o select de `stock_item_id`.

---

## Resumo dos endpoints

| Método | Path                                                   | Descrição                                  |
| ------ | ------------------------------------------------------ | ------------------------------------------ |
| GET    | `/api/pizzas`                                          | Listar pizzas (query: category, is_active) |
| GET    | `/api/pizzas/:id`                                      | Obter pizza                                |
| POST   | `/api/pizzas`                                          | Criar pizza                                |
| PUT    | `/api/pizzas/:id`                                      | Atualizar pizza                            |
| DELETE | `/api/pizzas/:id`                                      | Eliminar pizza                             |
| GET    | `/api/pizzas/:pizzaId/prices`                          | Listar preços                              |
| POST   | `/api/pizzas/:pizzaId/prices`                          | Criar preço                                |
| PUT    | `/api/pizzas/:pizzaId/prices/:priceId`                 | Atualizar preço                            |
| DELETE | `/api/pizzas/:pizzaId/prices/:priceId`                 | Eliminar preço                             |
| GET    | `/api/pizzas/:pizzaId/recipes`                         | Listar receitas                            |
| GET    | `/api/pizzas/:pizzaId/recipes/:recipeId`               | Obter receita                              |
| POST   | `/api/pizzas/:pizzaId/recipes`                         | Criar receita                              |
| PUT    | `/api/pizzas/:pizzaId/recipes/:recipeId`               | Atualizar receita                          |
| POST   | `/api/pizzas/:pizzaId/recipes/:recipeId/activate`      | Ativar receita                             |
| DELETE | `/api/pizzas/:pizzaId/recipes/:recipeId`               | Eliminar receita                           |
| GET    | `/api/pizzas/:pizzaId/recipes/:recipeId/items`         | Listar itens da receita                    |
| POST   | `/api/pizzas/:pizzaId/recipes/:recipeId/items`         | Criar item                                 |
| PUT    | `/api/pizzas/:pizzaId/recipes/:recipeId/items/:itemId` | Atualizar item                             |
| DELETE | `/api/pizzas/:pizzaId/recipes/:recipeId/items/:itemId` | Eliminar item                              |

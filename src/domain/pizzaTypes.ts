/** Categoria da pizza */
export type PizzaCategory = "classics" | "specials" | "sweeties";

/** Tamanho (preço e receita) */
export type PizzaSize = "small" | "large";

export type Pizza = {
  id: string;
  name: string;
  description: string;
  category: PizzaCategory;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type PizzaPrice = {
  id: string;
  pizza_id: string;
  size: PizzaSize;
  price: number;
  created_at?: string;
  updated_at?: string;
};

export type PizzaRecipe = {
  id: string;
  pizza_id: string;
  version: number;
  is_active: boolean;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PizzaRecipeItem = {
  id: string;
  recipe_id: string;
  stock_item_id: string;
  size: PizzaSize;
  quantity: number;
  waste_factor: number | null;
  is_optional: boolean;
  created_at?: string;
};

export type PizzaCreateBody = {
  name: string;
  description?: string;
  category: PizzaCategory;
  is_active?: boolean;
};

export type PizzaUpdateBody = Partial<PizzaCreateBody>;

export type PizzaPriceCreateBody = {
  pizza_id: string;
  size: PizzaSize;
  price: number;
};

export type PizzaPriceUpdateBody = { price?: number };

export type PizzaRecipeCreateBody = {
  pizza_id: string;
  version?: number;
  is_active?: boolean;
  notes?: string | null;
};

export type PizzaRecipeUpdateBody = {
  version?: number;
  is_active?: boolean;
  notes?: string | null;
};

export type PizzaRecipeItemCreateBody = {
  recipe_id: string;
  stock_item_id: string;
  size: PizzaSize;
  quantity: number;
  waste_factor?: number | null;
  is_optional?: boolean;
};

export type PizzaRecipeItemUpdateBody = {
  quantity?: number;
  waste_factor?: number | null;
  is_optional?: boolean;
};

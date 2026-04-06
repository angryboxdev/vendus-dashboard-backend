export type Preparation = {
  id: string;
  name: string;
  description: string | null;
  yield_qty: number;
  yield_unit: string;
  use_as_unit: boolean;
  created_at?: string;
  updated_at?: string;
};

export type PreparationItem = {
  id: string;
  preparation_id: string;
  stock_item_id: string;
  quantity: number;
  created_at?: string;
};

export type PreparationCreateBody = {
  name: string;
  description?: string | null;
  yield_qty: number;
  yield_unit: string;
  use_as_unit?: boolean;
};

export type PreparationUpdateBody = {
  name?: string;
  description?: string | null;
  yield_qty?: number;
  yield_unit?: string;
  use_as_unit?: boolean;
};

export type PreparationItemCreateBody = {
  preparation_id: string;
  stock_item_id: string;
  quantity: number;
};

export type PreparationItemUpdateBody = {
  quantity: number;
};

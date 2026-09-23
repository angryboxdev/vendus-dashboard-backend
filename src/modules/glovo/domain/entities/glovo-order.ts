export interface GlovoOrderAttribute {
  id: string;
  quantity: number;
  price: number;
  name: string;
}

export interface GlovoOrderProduct {
  id: string;
  purchased_product_id: string;
  quantity: number;
  price: number;
  discount?: number;
  name: string;
  attributes: GlovoOrderAttribute[];
}

export interface GlovoCourier {
  name: string;
  phone_number?: string;
}

export interface GlovoCustomer {
  name: string;
  phone_number?: string;
  hash: string;
}

export interface GlovoOrder {
  order_id: string;
  store_id: string;
  order_time?: string;
  estimated_pickup_time?: string;
  payment_method: "CASH" | "DELAYED";
  currency: string;
  order_code: string;
  allergy_info?: string;
  special_requirements?: string;
  estimated_total_price: number;
  delivery_fee?: number | null;
  minimum_basket_surcharge?: number | null;
  courier: GlovoCourier;
  customer: GlovoCustomer;
  products: GlovoOrderProduct[];
  bundled_orders: string[];
  pick_up_code?: string;
  is_picked_up_by_customer: boolean;
  cutlery_requested?: boolean;
}

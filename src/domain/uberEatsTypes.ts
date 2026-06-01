/** Payload do webhook Uber Eats (event: orders.notification) */
export type UberEatsWebhookPayload = {
  event_id: string;
  event_type: string;
  meta: {
    status: string;
    resource_href?: string;
  };
  resource_id: string;
  event_time: number;
};

export type UberEatsMoney = {
  /** Valor em cents (unidade mínima da moeda) */
  amount: number;
  currency_code: string;
};

export type UberEatsModifier = {
  id: string;
  title: string;
  external_data?: string;
  quantity: number;
  price: {
    unit_price: UberEatsMoney;
    total_price: UberEatsMoney;
  };
};

export type UberEatsModifierGroup = {
  id: string;
  title: string;
  selected_items: UberEatsModifier[];
};

export type UberEatsOrderItem = {
  id: string;
  instance_id?: string;
  title: string;
  /** ID definido no menu Uber Eats — usado como referência Vendus se preenchido */
  external_data?: string;
  quantity: number;
  price: {
    unit_price: UberEatsMoney;
    total_price: UberEatsMoney;
  };
  selected_modifier_groups?: UberEatsModifierGroup[];
};

export type UberEatsOrder = {
  id: string;
  display_id: string;
  current_state: string;
  store: { id: string };
  cart: {
    items: UberEatsOrderItem[];
    special_instructions?: string;
  };
  payment: {
    charges: {
      total: UberEatsMoney;
      sub_total?: UberEatsMoney;
      tax?: UberEatsMoney;
      delivery_fee?: UberEatsMoney;
    };
  };
  placed_at: string;
};

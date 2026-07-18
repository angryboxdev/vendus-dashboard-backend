export type DeliveryStatus =
  | 'pending'
  | 'received'
  | 'cooking'
  | 'waiting_to_delivery'
  | 'delivered'
  | 'canceled';

export type DeliveryType = 'table' | 'delivery' | 'takeaway' | 'pickup';

export interface DeliveryItem {
  id: number;
  name: string;
  qty: number;
  notes: string;
}

export interface DeliveryTable {
  id?: number;
  name: string;
}

export interface Delivery {
  id: number;
  reference: number;
  type: DeliveryType;
  status: DeliveryStatus;
  source: string;
  kitchenId: number;
  tableId: number;
  table: DeliveryTable | null;
  items: DeliveryItem[];
  extraInfo: string;
  dateCreate?: string;
  dateUpdate?: string;
}

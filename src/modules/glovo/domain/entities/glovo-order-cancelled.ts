export type GlovoCancellationReason =
  | "USER_ERROR"
  | "PRODUCTS_NOT_AVAILABLE"
  | "PARTNER_PRINTER_ISSUE"
  | "STORE_CAN_NOT_DELIVER"
  | "ORDER_NOT_FEASIBLE"
  | "OTHER";

export interface GlovoOrderCancelled {
  order_id: string;
  store_id: string;
  cancellation_reason?: GlovoCancellationReason;
}

export interface WebhookOrderEvent {
  enterpriseId: string;
  /** CREATED | MODIFIED | DELETED | ACCEPTED */
  event: string;
  resource: string;
  payload: unknown;
  receivedAt: Date;
}

export interface OrderEventBusPort {
  publish(event: WebhookOrderEvent): void;
  /** Returns an unsubscribe function. */
  subscribe(listener: (event: WebhookOrderEvent) => void): () => void;
}

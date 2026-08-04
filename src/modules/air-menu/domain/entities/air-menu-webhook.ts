export interface AirMenuWebhook {
  webhookId: string;
  url: string;
  events: string[];
  resource: string;
  active: boolean;
}

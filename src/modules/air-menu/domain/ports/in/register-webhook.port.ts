import type { AirMenuWebhook } from "../../entities/air-menu-webhook.js";

export interface RegisterWebhookInput {
  enterpriseId: string;
  url: string;
  events?: string[];
  resource?: string;
  secret?: string;
}

export interface RegisterWebhookPort {
  execute(input: RegisterWebhookInput): Promise<AirMenuWebhook>;
}

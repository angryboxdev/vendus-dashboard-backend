import type { AirMenuWebhook } from "../../domain/entities/air-menu-webhook.js";
import type {
  RegisterWebhookInput,
  RegisterWebhookPort,
} from "../../domain/ports/in/register-webhook.port.js";
import type { AirMenuGatewayPort } from "../../domain/ports/out/air-menu-gateway.port.js";
import type { SessionManagerService } from "../../domain/services/session-manager.service.js";

export class RegisterWebhookUseCase implements RegisterWebhookPort {
  constructor(
    private readonly sessionManager: SessionManagerService,
    private readonly gateway: AirMenuGatewayPort,
  ) {}

  async execute(input: RegisterWebhookInput): Promise<AirMenuWebhook> {
    const session = await this.sessionManager.getValidSession();
    return this.gateway.createWebhook({ sessionId: session.sessionId, ...input });
  }
}

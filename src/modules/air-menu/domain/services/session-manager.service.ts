import type { AirMenuGatewayPort } from "../ports/out/air-menu-gateway.port.js";
import { AirMenuSession } from "../entities/air-menu-session.js";
import type { AirMenuEnterprise } from "../entities/air-menu-enterprise.js";

/**
 * Mantém uma sessão AirMenu em memória e re-autentica automaticamente
 * quando expira (margem de 25 min sobre os 30 min da API).
 *
 * O `authPromise` evita race conditions quando vários pedidos paralelos
 * chamam getValidSession ao mesmo tempo e a sessão ainda não existe.
 */
export class SessionManagerService {
  private session: AirMenuSession | null = null;
  private authPromise: Promise<AirMenuSession> | null = null;

  constructor(
    private readonly gateway: AirMenuGatewayPort,
    private readonly username: string,
    private readonly password: string,
    private readonly enterprises: AirMenuEnterprise[],
  ) {}

  async getValidSession(): Promise<AirMenuSession> {
    if (this.session?.isValid()) return this.session;

    // Se já há uma autenticação em curso, aguarda a mesma em vez de lançar outra
    if (!this.authPromise) {
      this.authPromise = this.doAuthenticate().finally(() => {
        this.authPromise = null;
      });
    }
    return this.authPromise;
  }

  private async doAuthenticate(): Promise<AirMenuSession> {
    const result = await this.gateway.authenticate(this.username, this.password);
    this.session = AirMenuSession.create(result.sessionId, this.enterprises);
    console.log(`[AirMenu] Sessão renovada, válida por 25 min`);
    return this.session;
  }
}

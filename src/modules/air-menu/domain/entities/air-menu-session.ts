import type { AirMenuEnterprise } from "./air-menu-enterprise.js";

/** Sessão AirMenu em memória. Expira em 25 min (margem sobre os 30 min da API). */
export class AirMenuSession {
  private constructor(
    readonly sessionId: string,
    readonly enterprises: AirMenuEnterprise[],
    private readonly expiresAt: Date,
  ) {}

  static create(
    sessionId: string,
    enterprises: AirMenuEnterprise[],
  ): AirMenuSession {
    const expiresAt = new Date(Date.now() + 25 * 60 * 1000);
    return new AirMenuSession(sessionId, enterprises, expiresAt);
  }

  isValid(): boolean {
    return this.expiresAt > new Date();
  }
}

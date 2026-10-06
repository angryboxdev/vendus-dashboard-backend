import type {
  AirMenuGatewayPort,
  AuthenticateResult,
  CreateWebhookInput,
  CreateWebhookResult,
  RawMenuNode,
  RawOrderItemInstance,
} from "../../domain/ports/out/air-menu-gateway.port.js";
import type { MinIntervalScheduler } from "../../domain/services/min-interval-scheduler.js";

/**
 * Decorator do gateway AirMenu que respeita o limite da API (1 pedido a cada
 * 2 s — ver `AIRMENU_MIN_REQUEST_INTERVAL_MS` na composition root).
 *
 * Todos os pedidos passam por aqui (autenticação, ordens, menu, webhook),
 * por isso o limite vale para o módulo inteiro, incluindo quem consome
 * `GetSummaryPort` (páginas, fecho de caixa, declaração de vendas).
 */
export class RateLimitedAirMenuGateway implements AirMenuGatewayPort {
  constructor(
    private readonly inner: AirMenuGatewayPort,
    private readonly scheduler: MinIntervalScheduler,
  ) {}

  authenticate(username: string, password: string): Promise<AuthenticateResult> {
    return this.scheduler.schedule(() => this.inner.authenticate(username, password));
  }

  getOrderIds(sessionId: string, enterpriseId: string, startDate: number, endDate: number): Promise<string[]> {
    return this.scheduler.schedule(() => this.inner.getOrderIds(sessionId, enterpriseId, startDate, endDate));
  }

  getOrders(
    sessionId: string,
    enterpriseId: string,
    orderId: string,
  ): Promise<Record<string, RawOrderItemInstance[]>> {
    return this.scheduler.schedule(() => this.inner.getOrders(sessionId, enterpriseId, orderId));
  }

  getEnterpriseDivisionIds(sessionId: string, enterpriseId: string): Promise<string[]> {
    return this.scheduler.schedule(() => this.inner.getEnterpriseDivisionIds(sessionId, enterpriseId));
  }

  getMenu(sessionId: string, enterpriseId: string, divisionId: string): Promise<RawMenuNode[]> {
    return this.scheduler.schedule(() => this.inner.getMenu(sessionId, enterpriseId, divisionId));
  }

  createWebhook(input: CreateWebhookInput): Promise<CreateWebhookResult> {
    return this.scheduler.schedule(() => this.inner.createWebhook(input));
  }
}

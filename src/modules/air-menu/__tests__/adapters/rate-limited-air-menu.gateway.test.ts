import { RateLimitedAirMenuGateway } from '../../adapters/out/rate-limited-air-menu.gateway.js';
import { MinIntervalScheduler } from '../../domain/services/min-interval-scheduler.js';
import type { AirMenuGatewayPort } from '../../domain/ports/out/air-menu-gateway.port.js';

beforeEach(() => { jest.useFakeTimers({ now: 0 }); });
afterEach(() => { jest.useRealTimers(); });

describe('RateLimitedAirMenuGateway', () => {
  it('espaça 2 s TODOS os tipos de pedido ao AirMenu e devolve os resultados do gateway real', async () => {
    const startedAt: number[] = [];
    const mark = () => startedAt.push(Date.now());
    const inner = {
      authenticate: async () => { mark(); return { sessionId: 's' }; },
      getOrderIds: async () => { mark(); return ['1']; },
      getOrders: async () => { mark(); return {}; },
      getEnterpriseDivisionIds: async () => { mark(); return ['d']; },
      getMenu: async () => { mark(); return []; },
      createWebhook: async () => { mark(); return { webhookId: 'w', url: '', events: [], resource: '', active: true }; },
    } as AirMenuGatewayPort;
    const gateway = new RateLimitedAirMenuGateway(inner, new MinIntervalScheduler(2000));

    const all = Promise.all([
      gateway.authenticate('u', 'p'),
      gateway.getOrderIds('s', 'e', 0, 1),
      gateway.getOrders('s', 'e', '1'),
      gateway.getEnterpriseDivisionIds('s', 'e'),
      gateway.getMenu('s', 'e', 'd'),
      gateway.createWebhook({ sessionId: 's', enterpriseId: 'e', url: 'u' }),
    ]);
    await jest.advanceTimersByTimeAsync(10_000);
    const results = await all;

    expect(startedAt).toEqual([0, 2000, 4000, 6000, 8000, 10000]);
    expect(results[0]).toEqual({ sessionId: 's' });
    expect(results[1]).toEqual(['1']);
  });
});

import { RegisterWebhookUseCase } from '../../application/use-cases/register-webhook.use-case.js';
import { AirMenuSession } from '../../domain/entities/air-menu-session.js';
import type { AirMenuGatewayPort, CreateWebhookResult } from '../../domain/ports/out/air-menu-gateway.port.js';
import type { SessionManagerService } from '../../domain/services/session-manager.service.js';

const STUB_WEBHOOK_RESULT: CreateWebhookResult = {
  webhookId: 'wh_test123',
  url: 'https://example.com/webhook',
  events: ['ORDER'],
  resource: 'order',
  active: true,
};

function makeStubs(sessionId = 'sess-abc') {
  const session = AirMenuSession.create(sessionId, []);

  const sessionManager = {
    getValidSession: async () => session,
  } as unknown as SessionManagerService;

  const capturedInputs: Parameters<AirMenuGatewayPort['createWebhook']>[0][] = [];
  const gateway = {
    createWebhook: async (input: Parameters<AirMenuGatewayPort['createWebhook']>[0]) => {
      capturedInputs.push(input);
      return STUB_WEBHOOK_RESULT;
    },
  } as unknown as AirMenuGatewayPort;

  const useCase = new RegisterWebhookUseCase(sessionManager, gateway);
  return { useCase, capturedInputs };
}

describe('RegisterWebhookUseCase', () => {
  it('passa o sessionId da sessão activa ao gateway', async () => {
    const { useCase, capturedInputs } = makeStubs('sess-xyz');
    await useCase.execute({ enterpriseId: 'ent-1', url: 'https://example.com/wh' });
    expect(capturedInputs[0].sessionId).toBe('sess-xyz');
  });

  it('passa todos os campos do input ao gateway', async () => {
    const { useCase, capturedInputs } = makeStubs();
    const input = {
      enterpriseId: 'ent-42',
      url: 'https://example.com/wh',
      events: ['ORDER'],
      resource: 'order',
      secret: 'my-secret',
    };
    await useCase.execute(input);
    expect(capturedInputs[0]).toMatchObject(input);
  });

  it('retorna o resultado do gateway', async () => {
    const { useCase } = makeStubs();
    const result = await useCase.execute({ enterpriseId: 'ent-1', url: 'https://example.com/wh' });
    expect(result).toEqual(STUB_WEBHOOK_RESULT);
  });
});

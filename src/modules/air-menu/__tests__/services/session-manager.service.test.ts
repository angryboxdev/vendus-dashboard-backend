import { SessionManagerService } from '../../domain/services/session-manager.service.js';
import type { AirMenuGatewayPort } from '../../domain/ports/out/air-menu-gateway.port.js';
import type { AirMenuEnterprise } from '../../domain/entities/air-menu-enterprise.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ENTERPRISES: AirMenuEnterprise[] = [{ id: 'ent-1', name: 'Test Enterprise' }];

function makeGateway(sessionId = 'sess-1') {
  let callCount = 0;
  const gateway = {
    authenticate: async () => {
      callCount++;
      return { sessionId };
    },
  } as unknown as AirMenuGatewayPort;
  return { gateway, getCallCount: () => callCount };
}

// ─── autenticação inicial ──────────────────────────────────────────────────────

describe('SessionManagerService — autenticação', () => {
  it('autentica na primeira chamada e devolve uma sessão com o sessionId correcto', async () => {
    const { gateway } = makeGateway('sess-abc');
    const service = new SessionManagerService(gateway, 'user', 'pass', ENTERPRISES);

    const session = await service.getValidSession();

    expect(session.sessionId).toBe('sess-abc');
  });

  it('não autentica novamente enquanto a sessão é válida', async () => {
    const { gateway, getCallCount } = makeGateway();
    const service = new SessionManagerService(gateway, 'user', 'pass', ENTERPRISES);

    await service.getValidSession();
    await service.getValidSession();
    await service.getValidSession();

    expect(getCallCount()).toBe(1);
  });

  it('a sessão devolvida reporta isValid() = true imediatamente após criação', async () => {
    const { gateway } = makeGateway();
    const service = new SessionManagerService(gateway, 'user', 'pass', ENTERPRISES);

    const session = await service.getValidSession();

    expect(session.isValid()).toBe(true);
  });
});

// ─── deduplicação de chamadas concorrentes ────────────────────────────────────

describe('SessionManagerService — deduplicação de auth concorrente', () => {
  it('várias chamadas simultâneas sem sessão fazem apenas um authenticate', async () => {
    const { gateway, getCallCount } = makeGateway();
    const service = new SessionManagerService(gateway, 'user', 'pass', ENTERPRISES);

    // Dispara 5 chamadas em paralelo antes de qualquer uma completar
    await Promise.all([
      service.getValidSession(),
      service.getValidSession(),
      service.getValidSession(),
      service.getValidSession(),
      service.getValidSession(),
    ]);

    expect(getCallCount()).toBe(1);
  });

  it('todas as chamadas concorrentes recebem a mesma sessão', async () => {
    const { gateway } = makeGateway('sess-shared');
    const service = new SessionManagerService(gateway, 'user', 'pass', ENTERPRISES);

    const sessions = await Promise.all([
      service.getValidSession(),
      service.getValidSession(),
      service.getValidSession(),
    ]);

    const ids = sessions.map((s) => s.sessionId);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe('sess-shared');
  });
});

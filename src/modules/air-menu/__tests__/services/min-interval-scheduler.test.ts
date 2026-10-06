import { MinIntervalScheduler } from '../../domain/services/min-interval-scheduler.js';

// Fake timers do Jest: Date.now e setTimeout avançam juntos, sem esperar de verdade.
beforeEach(() => { jest.useFakeTimers({ now: 1_000 }); });
afterEach(() => { jest.useRealTimers(); });

describe('MinIntervalScheduler', () => {
  it('a primeira chamada corre de imediato', async () => {
    const s = new MinIntervalScheduler(2000);
    const startedAt: number[] = [];
    await s.schedule(async () => { startedAt.push(Date.now()); });
    expect(startedAt).toEqual([1_000]);
  });

  it('espaça pelo menos 2 s o início de chamadas pedidas em simultâneo, pela ordem pedida', async () => {
    const s = new MinIntervalScheduler(2000);
    const started: { id: number; at: number }[] = [];
    const all = Promise.all([1, 2, 3].map((id) => s.schedule(async () => { started.push({ id, at: Date.now() }); })));
    await jest.advanceTimersByTimeAsync(4_000);
    await all;
    expect(started).toEqual([{ id: 1, at: 1_000 }, { id: 2, at: 3_000 }, { id: 3, at: 5_000 }]);
  });

  it('não deixa a 2.ª chamada começar antes de passarem 2 s', async () => {
    const s = new MinIntervalScheduler(2000);
    let second = false;
    await s.schedule(async () => undefined);
    const p = s.schedule(async () => { second = true; });
    await jest.advanceTimersByTimeAsync(1_999);
    expect(second).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await p;
    expect(second).toBe(true);
  });

  it('não espera se já passaram 2 s desde a chamada anterior', async () => {
    const s = new MinIntervalScheduler(2000);
    await s.schedule(async () => undefined);
    await jest.advanceTimersByTimeAsync(5_000);
    const at: number[] = [];
    await s.schedule(async () => { at.push(Date.now()); });
    expect(at).toEqual([6_000]);
  });

  it('uma chamada que falha propaga o erro e não bloqueia as seguintes', async () => {
    const s = new MinIntervalScheduler(2000);
    await expect(s.schedule(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    const next = s.schedule(async () => 'ok');
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(next).resolves.toBe('ok');
  });
});

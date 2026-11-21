/**
 * Limita o ritmo de chamadas: no máximo `perSlot` chamadas começam em cada
 * janela de `minIntervalMs` (por defeito 1 — um início a cada intervalo).
 *
 * Usado para respeitar o limite da API AirMenu (2 pedidos a cada 2 s, decisão
 * da gerência em 2026-11-21): cada chamada reserva um lugar na janela livre
 * seguinte e espera por ela, pela ordem em que foi pedida. Não serializa a
 * execução — só controla os inícios.
 * `now` e `sleep` são injetáveis para os testes não dependerem do relógio.
 */
export class MinIntervalScheduler {
  private slotStart = Number.NEGATIVE_INFINITY;
  private used = 0;

  constructor(
    private readonly minIntervalMs: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private readonly perSlot = 1,
  ) {}

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    const now = this.now();
    if (this.used >= this.perSlot) {
      // Janela cheia: a próxima começa quando esta acabar (ou já, se passou).
      this.slotStart = Math.max(now, this.slotStart + this.minIntervalMs);
      this.used = 0;
    } else if (this.slotStart + this.minIntervalMs <= now) {
      // Janela expirada sem estar cheia: começa uma nova agora.
      this.slotStart = now;
      this.used = 0;
    }
    this.used++;
    const wait = this.slotStart - now;
    if (wait > 0) await this.sleep(wait);
    return fn();
  }
}

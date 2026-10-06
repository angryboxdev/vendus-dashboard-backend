/**
 * Garante um intervalo mínimo entre o INÍCIO de chamadas consecutivas.
 *
 * Usado para respeitar o limite da API AirMenu (1 pedido a cada 2 s):
 * cada chamada reserva o próximo slot livre e espera por ele, pela ordem em
 * que foi pedida. Não serializa a execução — só espaça os inícios.
 * `now` e `sleep` são injetáveis para os testes não dependerem do relógio.
 */
export class MinIntervalScheduler {
  private nextSlot = 0;

  constructor(
    private readonly minIntervalMs: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    const now = this.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.minIntervalMs;
    if (slot > now) await this.sleep(slot - now);
    return fn();
  }
}

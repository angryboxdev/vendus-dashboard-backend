import { fork } from "node:child_process";
import type { PdfContentReaderPort } from "../../domain/ports/out/pdf-content-reader.port.js";
import type { PdfContent } from "../../domain/entities/invoice-reading.js";
import type { BarcodeState } from "../../domain/entities/payment-document.js";

export interface IsolatedPdfReaderOptions {
  /** Caminho do script do processo filho (`pdf-reader.worker.js` compilado). */
  workerPath: string;
  /** Tempo máximo de cada operação; excedido, o processo filho é morto (SIGKILL). */
  timeoutMs?: number;
  /** Limite do heap do processo filho — esgotá-lo mata só o filho. */
  maxOldSpaceMb?: number;
}

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_OLD_SPACE_MB = 384;

/**
 * Executa o leitor de PDF num processo filho por operação. Um `Promise.race` com timeout não interrompe
 * trabalho que prende o processador nem evita um esgotamento de memória: um PDF assim derrubava o servidor
 * inteiro (e, com ele, o estado em memória do KDS). Aqui o servidor só espera pela resposta e mata o filho
 * quando passa o tempo, ou quando ele morre sozinho.
 */
export class IsolatedPdfContentReaderAdapter implements PdfContentReaderPort {
  private readonly timeoutMs: number;
  private readonly maxOldSpaceMb: number;

  constructor(private readonly options: IsolatedPdfReaderOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxOldSpaceMb = options.maxOldSpaceMb ?? DEFAULT_MAX_OLD_SPACE_MB;
  }

  read(fileBuffer: Buffer, mimeType: string): Promise<PdfContent | null> {
    return this.run<PdfContent | null>({ op: "read", buffer: fileBuffer, mimeType });
  }

  async readBarcode(fileBuffer: Buffer, maxPages: number): Promise<BarcodeState> {
    try {
      return await this.run<BarcodeState>({ op: "readBarcode", buffer: fileBuffer, maxPages });
    } catch (e) {
      // Como no leitor direto: sem leitura, os campos continuam a vir do texto.
      console.error("[invoices] leitura do código de barras falhou:", e instanceof Error ? e.message : e);
      return { status: "absent" };
    }
  }

  async extractLogo(fileBuffer: Buffer): Promise<{ png: Buffer; width: number; height: number } | null> {
    try {
      const logo = await this.run<{ png: Uint8Array; width: number; height: number } | null>({ op: "extractLogo", buffer: fileBuffer });
      return logo ? { ...logo, png: Buffer.from(logo.png) } : null;
    } catch (e) {
      console.error("[invoices] extração do logótipo falhou:", e instanceof Error ? e.message : e);
      return null;
    }
  }

  private run<T>(request: Record<string, unknown> & { buffer: Buffer }): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const child = fork(this.options.workerPath, [], {
        execArgv: [`--max-old-space-size=${this.maxOldSpaceMb}`],
        serialization: "advanced", // Buffers/Uint8Array sem passar por JSON
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      });
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill("SIGKILL"); // no-op se já terminou
        fn();
      };

      const timer = setTimeout(
        () => finish(() => reject(new Error(`leitura do PDF excedeu ${this.timeoutMs} ms (processo terminado)`))),
        this.timeoutMs,
      );
      child.once("message", (msg: { ok: boolean; result?: unknown; error?: string }) =>
        finish(() => (msg.ok ? resolve(msg.result as T) : reject(new Error(msg.error ?? "erro desconhecido no leitor de PDF")))),
      );
      child.once("error", (e) => finish(() => reject(e)));
      child.once("exit", (code, signal) =>
        finish(() => reject(new Error(`o processo de leitura do PDF terminou sem resposta (código ${code ?? "—"}, sinal ${signal ?? "—"})`))),
      );
      child.send(request);
    });
  }
}

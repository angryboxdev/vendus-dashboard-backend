import { LisbonClock } from "./adapters/out/lisbon-clock.js";
import { RsaSha1Signer } from "./adapters/out/rsa-sha1-signer.js";
import type { ClockPort } from "./domain/ports/out/clock.port.js";
import type { SignerPort } from "./domain/ports/out/signer.port.js";

/**
 * Composition root da faturação certificada (F1: só o motor fiscal).
 * Ainda NÃO está ligado ao `server.ts` — não expõe rotas nem toca em BD.
 *
 * Configuração (variáveis de ambiente, nunca no repositório):
 * - `INVOICING_SIGNING_PRIVATE_KEY` — PEM da chave privada do produtor (RSA 1024);
 * - `INVOICING_SIGNING_KEY_VERSION` — versão da chave (1, 2, …), vai para o HashControl;
 * - `INVOICING_CERTIFICATE_NUMBER` — n.º de certificado da AT; sem ele só há séries de formação.
 */
export interface InvoicingConfig {
  privateKeyPem: string | null;
  keyVersion: number;
  certificateNumber: string | null;
}

export function readInvoicingConfig(env: NodeJS.ProcessEnv = process.env): InvoicingConfig {
  const pem = env.INVOICING_SIGNING_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const keyVersion = Number(env.INVOICING_SIGNING_KEY_VERSION ?? "1");
  if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) throw new Error("INVOICING_SIGNING_KEY_VERSION inválida");
  return {
    privateKeyPem: pem || null,
    keyVersion,
    certificateNumber: env.INVOICING_CERTIFICATE_NUMBER?.trim() || null,
  };
}

export function createInvoicingModule(config: InvoicingConfig = readInvoicingConfig()): {
  /** null sem chave configurada: a emissão fica indisponível. */
  signer: SignerPort | null;
  clock: ClockPort;
  certificateNumber: string | null;
} {
  return {
    signer: config.privateKeyPem ? new RsaSha1Signer({ privateKeyPem: config.privateKeyPem, keyVersion: config.keyVersion }) : null,
    clock: new LisbonClock(),
    certificateNumber: config.certificateNumber,
  };
}

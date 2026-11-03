import type { Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery, type ScopedQueryFactory } from "../../infra/scoped-db/scoped-query.js";
import { dec } from "../../kernel/money/decimal.js";
import { createInvoicingRouter } from "./adapters/in/invoicing.controller.js";
import { LisbonClock } from "./adapters/out/lisbon-clock.js";
import { RsaSha1Signer } from "./adapters/out/rsa-sha1-signer.js";
import { SupabaseInvoicingStore } from "./adapters/out/supabase-invoicing-store.js";
import { InvoicingUseCases } from "./application/use-cases/invoicing.use-cases.js";
import { IssueDocumentUseCase } from "./application/use-cases/issue-document.use-case.js";
import type { IssuerDirectoryPort } from "./domain/ports/out/issuer-directory.port.js";

/**
 * Composition root da faturação certificada AT. Isolado: não lê nem escreve
 * Vendus, AirMenu, DRE, custos nem stock. O emitente vem do módulo
 * `legal-entities` por `IssuerDirectoryPort` (ligado no server.ts).
 * Configuração em `src/config/env.ts` (`INVOICING_*`), passada pelo server.ts.
 */
export interface InvoicingConfig {
  privateKeyPem: string | null;
  keyVersion: number;
  /** N.º de certificado da AT; null enquanto o programa não está certificado (só formação). */
  certificateNumber: string | null;
}

export function readInvoicingConfig(env: {
  privateKeyPem: string | null;
  keyVersion: string | null;
  certificateNumber: string | null;
}): InvoicingConfig {
  const keyVersion = Number(env.keyVersion ?? "1");
  if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) throw new Error("INVOICING_SIGNING_KEY_VERSION inválida");
  const certificateNumber = env.certificateNumber?.trim() || null;
  if (certificateNumber !== null && !/^[1-9]\d{0,3}$/.test(certificateNumber)) throw new Error("INVOICING_CERTIFICATE_NUMBER inválido");
  return { privateKeyPem: env.privateKeyPem?.replace(/\\n/g, "\n").trim() || null, keyVersion, certificateNumber };
}

/** Fatura simplificada: até 100 € sem IVA (CIVA art. 40.º, n.º 1, al. b); refeições = prestação de serviços). */
const SIMPLIFIED_INVOICE_LIMIT_NET = dec("100");

/** Configuração ilegível → faturação desligada (503), nunca o servidor em baixo; a mensagem não inclui a chave. */
export function safeInvoicingConfig(read: () => InvoicingConfig): InvoicingConfig {
  try {
    return read();
  } catch (e) {
    console.error("[faturação] configuração inválida — emissão desligada:", e instanceof Error ? e.message : "erro");
    return { privateKeyPem: null, keyVersion: 1, certificateNumber: null };
  }
}

function signerFrom(config: InvoicingConfig): RsaSha1Signer | null {
  if (!config.privateKeyPem) return null;
  try {
    return new RsaSha1Signer({ privateKeyPem: config.privateKeyPem, keyVersion: config.keyVersion });
  } catch (e) {
    // Sem detalhes do erro do OpenSSL: podem ecoar partes do PEM.
    console.error("[faturação] chave de assinatura inválida (tem de ser RSA 1024 em PEM) — emissão desligada");
    return null;
  }
}

export function createInvoicingModule(deps: { config: InvoicingConfig; issuers: IssuerDirectoryPort; scoped?: ScopedQueryFactory }): {
  router: Router;
  useCases: InvoicingUseCases;
  issue: IssueDocumentUseCase;
} {
  const scoped = deps.scoped ?? createScopedQuery;
  const store = new SupabaseInvoicingStore(scoped);
  const { config } = deps;
  const signer = signerFrom(config);
  const common = { store, certificateNumber: config.certificateNumber, simplifiedInvoiceLimitNet: SIMPLIFIED_INVOICE_LIMIT_NET };
  const useCases = new InvoicingUseCases({ ...common, signingAvailable: signer !== null });
  const issue = new IssueDocumentUseCase({ ...common, signer, clock: new LisbonClock(), issuers: deps.issuers });
  return { router: createInvoicingRouter(useCases, issue, new SupabaseIdempotencyStore(scoped)), useCases, issue };
}

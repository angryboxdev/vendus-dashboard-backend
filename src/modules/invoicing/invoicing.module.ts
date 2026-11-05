import type { Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { listOrganizations } from "../../infra/scoped-db/organization-listing.js";
import { createScopedQuery, type ScopedQueryFactory } from "../../infra/scoped-db/scoped-query.js";
import { dec } from "../../kernel/money/decimal.js";
import { createInvoicingRouter } from "./adapters/in/invoicing.controller.js";
import { AtSoapGateway } from "./adapters/out/at-soap-gateway.js";
import { LisbonClock } from "./adapters/out/lisbon-clock.js";
import { RsaSha1Signer } from "./adapters/out/rsa-sha1-signer.js";
import { SupabaseAtCredentials } from "./adapters/out/supabase-at-credentials.js";
import { SupabaseAtStore } from "./adapters/out/supabase-at-store.js";
import { SupabaseInvoicingStore } from "./adapters/out/supabase-invoicing-store.js";
import { AtCommunicationUseCases } from "./application/use-cases/at-communication.use-cases.js";
import { InvoicingUseCases, type SaftSoftwareConfig } from "./application/use-cases/invoicing.use-cases.js";
import { IssueDocumentUseCase } from "./application/use-cases/issue-document.use-case.js";
import type { AtEnvironment } from "./domain/entities/at-communication.js";
import { AtBusyError } from "./domain/errors.js";
import type { AtGatewayPort } from "./domain/ports/out/at-gateway.port.js";
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
  /** Produtora e versão do software (cabeçalho do SAF-T). */
  software: SaftSoftwareConfig;
  /** Comunicação à AT (F6); null = desligada (falta o certificado ou a chave pública da AT). */
  at: AtConfig | null;
}

export interface AtConfig {
  environment: AtEnvironment;
  pfx: Buffer;
  passphrase: string;
  authPublicKeyPem: string;
}

/**
 * PEM vindo de uma variável de ambiente: aceita quebras de linha reais, `\n`
 * escritos e uma só linha com espaços (o que alguns painéis fazem ao colar).
 */
export function normalizePem(raw: string | null | undefined): string | null {
  const text = raw?.replace(/\\n/g, "\n").trim();
  if (!text) return null;
  const m = /^(-----BEGIN [A-Z ]+-----)\s*([\s\S]*?)\s*(-----END [A-Z ]+-----)$/.exec(text);
  if (!m) return text;
  const body = m[2]!.replace(/\s+/g, "");
  return [m[1], ...(body.match(/.{1,64}/g) ?? []), m[3]].join("\n");
}

export function readInvoicingConfig(env: {
  privateKeyPem: string | null;
  keyVersion: string | null;
  certificateNumber: string | null;
  producerTaxId?: string | null;
  producerName?: string | null;
  productVersion?: string | null;
  productName?: string | null;
  atEnvironment?: string | null;
  atTlsPfxBase64?: string | null;
  atTlsPassphrase?: string | null;
  atAuthPublicKeyPem?: string | null;
}): InvoicingConfig {
  const keyVersion = Number(env.keyVersion ?? "1");
  if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) throw new Error("INVOICING_SIGNING_KEY_VERSION inválida");
  const certificateNumber = env.certificateNumber?.trim() || null;
  if (certificateNumber !== null && !/^[1-9]\d{0,3}$/.test(certificateNumber)) throw new Error("INVOICING_CERTIFICATE_NUMBER inválido");
  const version = env.productVersion?.trim() || "1.0.0";
  if (version.length > 30) throw new Error("INVOICING_PRODUCT_VERSION com mais de 30 caracteres");
  return {
    privateKeyPem: normalizePem(env.privateKeyPem),
    keyVersion,
    certificateNumber,
    software: { productName: env.productName?.trim() || "Mezza", producerTaxId: env.producerTaxId?.trim() || null, producerName: env.producerName?.trim() || null, version },
    at: readAtConfig(env),
  };
}

/** Comunicação à AT: só o ambiente de testes nesta fase; sem certificado ou chave pública, desligada. */
function readAtConfig(env: { atEnvironment?: string | null; atTlsPfxBase64?: string | null; atTlsPassphrase?: string | null; atAuthPublicKeyPem?: string | null }): AtConfig | null {
  const environment = env.atEnvironment?.trim() || "test";
  if (environment !== "test") throw new Error("INVOICING_AT_ENVIRONMENT: só o ambiente de testes (\"test\") é suportado antes do certificado");
  const pfx = env.atTlsPfxBase64?.trim();
  const publicKey = env.atAuthPublicKeyPem?.trim();
  if (!pfx || !publicKey) return null;
  return { environment, pfx: Buffer.from(pfx, "base64"), passphrase: env.atTlsPassphrase ?? "", authPublicKeyPem: publicKey };
}

/** Fatura simplificada: até 100 € sem IVA (CIVA art. 40.º, n.º 1, al. b); refeições = prestação de serviços). */
const SIMPLIFIED_INVOICE_LIMIT_NET = dec("100");

/** Configuração ilegível → faturação desligada (503), nunca o servidor em baixo; a mensagem não inclui a chave. */
export function safeInvoicingConfig(read: () => InvoicingConfig): InvoicingConfig {
  try {
    return read();
  } catch (e) {
    console.error("[faturação] configuração inválida — emissão desligada:", e instanceof Error ? e.message : "erro");
    return { privateKeyPem: null, keyVersion: 1, certificateNumber: null, software: { productName: "Mezza", producerTaxId: null, producerName: null, version: "1.0.0" }, at: null };
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

function gatewayFrom(config: InvoicingConfig): AtGatewayPort | null {
  if (!config.at) return null;
  try {
    return new AtSoapGateway({ environment: config.at.environment, pfx: config.at.pfx, passphrase: config.at.passphrase, authPublicKeyPem: config.at.authPublicKeyPem });
  } catch {
    // Sem detalhes: o erro do OpenSSL pode ecoar partes da chave.
    console.error("[faturação] certificado ou chave pública da AT inválidos — comunicação à AT desligada");
    return null;
  }
}

export function createInvoicingModule(deps: { config: InvoicingConfig; issuers: IssuerDirectoryPort; scoped?: ScopedQueryFactory; gateway?: AtGatewayPort | null }): {
  router: Router;
  useCases: InvoicingUseCases;
  issue: IssueDocumentUseCase;
  at: AtCommunicationUseCases;
  /** Certificado e chave da AT configurados: o cron comunica a cada 10 min. */
  atConfigured: boolean;
  /** Para o cron: comunica o que falta em todas as organizações (uma de cada vez). */
  communicateAllPending(): Promise<void>;
} {
  const scoped = deps.scoped ?? createScopedQuery;
  const store = new SupabaseInvoicingStore(scoped);
  const { config } = deps;
  const signer = signerFrom(config);
  const common = { store, certificateNumber: config.certificateNumber, simplifiedInvoiceLimitNet: SIMPLIFIED_INVOICE_LIMIT_NET };
  const clock = new LisbonClock();
  const useCases = new InvoicingUseCases({ ...common, signingAvailable: signer !== null, issuers: deps.issuers, clock, software: config.software });
  const issue = new IssueDocumentUseCase({ ...common, signer, clock, issuers: deps.issuers });
  const gateway = deps.gateway !== undefined ? deps.gateway : gatewayFrom(config);
  const at = new AtCommunicationUseCases({
    store,
    at: new SupabaseAtStore(scoped),
    credentials: new SupabaseAtCredentials(scoped),
    gateway,
    environment: config.at?.environment ?? "test",
    issuers: deps.issuers,
    clock,
    certificateNumber: config.certificateNumber,
  });

  let running = false;
  async function communicateAllPending(): Promise<void> {
    if (!gateway || running) return;
    running = true;
    try {
      for (const org of await listOrganizations()) {
        try {
          const r = await at.communicatePending(org.organizationId, "sistema");
          if (r.attempted > 0) console.log(`[faturação] AT ${org.organizationId}: ${r.accepted} aceites, ${r.rejected} recusados, ${r.failed} por repetir`);
        } catch (e) {
          // Comunicação manual em curso nessa organização: fica para a próxima volta.
          if (e instanceof AtBusyError) continue;
          console.error("[faturação] comunicação à AT falhou:", e instanceof Error ? e.message : "erro");
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    router: createInvoicingRouter(useCases, issue, new SupabaseIdempotencyStore(scoped), at),
    useCases,
    issue,
    at,
    atConfigured: gateway !== null,
    communicateAllPending,
  };
}

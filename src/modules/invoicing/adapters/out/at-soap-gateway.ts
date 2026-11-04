import { constants, createCipheriv, createPublicKey, publicEncrypt, randomBytes, X509Certificate, type KeyObject } from "node:crypto";
import { Agent, request } from "node:https";
import type { AtCredentials, AtEnvironment } from "../../domain/entities/at-communication.js";
import { AtTransportError } from "../../domain/errors.js";
import type { AtGatewayPort, AtService } from "../../domain/ports/out/at-gateway.port.js";
import { soapEnvelope, usernameTokenHeader } from "../../domain/services/at-soap.service.js";

/** Endereços dos webservices («Aspetos genéricos» 3.7; manual de Séries). */
export const AT_ENDPOINTS: Record<AtEnvironment, Record<AtService, string>> = {
  test: {
    series: "https://servicos.portaldasfinancas.gov.pt:722/SeriesWSService",
    efatura: "https://servicos.portaldasfinancas.gov.pt:723/fatcorews/ws/",
  },
  production: {
    series: "https://servicos.portaldasfinancas.gov.pt:422/SeriesWSService",
    efatura: "https://servicos.portaldasfinancas.gov.pt:423/fatcorews/ws/",
  },
};

export interface AtSoapGatewayConfig {
  environment: AtEnvironment;
  /** Certificado do produtor assinado pela AT + chave privada (.pfx). */
  pfx: Buffer;
  passphrase: string;
  /** Chave pública do Sistema de Autenticação da AT (PEM: chave pública ou certificado). */
  authPublicKeyPem: string;
  timeoutMs?: number;
}

/** Transporte HTTP (injetável nos testes): devolve o corpo da resposta, seja qual for o estado HTTP. */
export type AtTransport = (url: string, xml: string) => Promise<string>;

const MAX_RESPONSE_BYTES = 1_000_000;

export function readAuthPublicKey(pem: string): KeyObject {
  const text = pem.replace(/\\n/g, "\n").trim();
  return text.includes("BEGIN CERTIFICATE") ? new X509Certificate(text).publicKey : createPublicKey(text);
}

const aes = (key: Buffer, plain: string) => {
  const c = createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([c.update(plain, "utf8"), c.final()]).toString("base64");
};

/**
 * Cabeçalho WS-Security («Aspetos genéricos» 2.2.1): chave simétrica AES-128
 * nova em cada pedido (Ks), cifrada com a chave pública da AT (Nonce); senha e
 * instante UTC cifrados com Ks em AES-ECB-PKCS5 (Password, Created).
 * RSA com PKCS#1 v1.5: o padding não está no manual — é o «RSA» por omissão do
 * cliente Java de referência da AT; confirmar no ambiente de testes.
 */
export function wsSecurityHeader(credentials: AtCredentials, authPublicKey: KeyObject, now: Date = new Date()): string {
  const ks = randomBytes(16);
  const nonce = publicEncrypt({ key: authPublicKey, padding: constants.RSA_PKCS1_PADDING }, ks).toString("base64");
  return usernameTokenHeader({ username: credentials.username, password: aes(ks, credentials.password), nonce, created: aes(ks, now.toISOString()) });
}

function httpsTransport(agent: Agent, timeoutMs: number): AtTransport {
  return (url, xml) =>
    new Promise((resolve, reject) => {
      const req = request(
        url,
        { method: "POST", agent, timeout: timeoutMs, headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""', "Content-Length": Buffer.byteLength(xml) } },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (c: Buffer) => {
            size += c.length;
            if (size > MAX_RESPONSE_BYTES) req.destroy(new Error("resposta demasiado grande"));
            else chunks.push(c);
          });
          res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
          res.on("error", reject);
        },
      );
      // `timeout` mede a inatividade do socket; este limita a duração total do pedido.
      const total = setTimeout(() => req.destroy(new Error("tempo esgotado")), timeoutMs * 2);
      req.on("timeout", () => req.destroy(new Error("tempo esgotado")));
      req.on("error", (e) => {
        clearTimeout(total);
        reject(e);
      });
      req.on("close", () => clearTimeout(total));
      req.end(xml);
    });
}

/**
 * Cliente SOAP da AT com autenticação mútua (mTLS). Nunca escreve no log o
 * pedido nem a resposta (levam a senha cifrada e dados de clientes).
 */
export class AtSoapGateway implements AtGatewayPort {
  private readonly authKey: KeyObject;
  private readonly transport: AtTransport;

  constructor(
    private readonly config: AtSoapGatewayConfig,
    transport?: AtTransport,
  ) {
    this.authKey = readAuthPublicKey(config.authPublicKeyPem);
    this.transport =
      transport ?? httpsTransport(new Agent({ pfx: config.pfx, passphrase: config.passphrase, keepAlive: true, maxSockets: 4 }), config.timeoutMs ?? 30_000);
  }

  async send(service: AtService, body: string, credentials: AtCredentials): Promise<string> {
    const xml = soapEnvelope(wsSecurityHeader(credentials, this.authKey), body);
    try {
      return await this.transport(AT_ENDPOINTS[this.config.environment][service], xml);
    } catch (e) {
      // Para o cliente e o registo só a categoria; o detalhe (IP, OpenSSL) fica no log do servidor. Nunca o pedido.
      const message = e instanceof Error ? e.message : "";
      console.error(`[faturação] AT ${service}: falha de ligação (${(e as { code?: string } | null)?.code ?? message})`);
      throw new AtTransportError(/tempo esgotado|timeout/i.test(message) ? "tempo esgotado na ligação à AT" : "falha de ligação à AT");
    }
  }
}

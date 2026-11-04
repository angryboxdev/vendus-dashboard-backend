import { el, tagText, wrap } from "./xml-text.js";

/**
 * Envelope SOAP 1.1 e cabeçalho WS-Security (UsernameToken) da AT
 * («e-Fatura — Aspetos genéricos», 2.2.1). Os campos Password, Nonce e
 * Created chegam já cifrados e em Base64 (a cifra é do adapter).
 */
export interface UsernameToken {
  /** `<NIF>/<subutilizador>`. */
  username: string;
  /** Base64(AES-ECB-PKCS5(Ks, senha)). */
  password: string;
  /** Base64(RSA(KpubSA, Ks)). */
  nonce: string;
  /** Base64(AES-ECB-PKCS5(Ks, instante UTC ISO 8601)). */
  created: string;
}

const SECEXT = "http://schemas.xmlsoap.org/ws/2002/12/secext";

export function usernameTokenHeader(t: UsernameToken): string {
  return (
    `<wss:Security xmlns:wss="${SECEXT}">` +
    wrap("wss:UsernameToken", el("wss:Username", t.username) + el("wss:Password", t.password) + el("wss:Nonce", t.nonce) + el("wss:Created", t.created)) +
    "</wss:Security>"
  );
}

export function soapEnvelope(header: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Header>${header}</S:Header><S:Body>${body}</S:Body></S:Envelope>`;
}

/** Mensagem de um SOAP Fault (erro do serviço antes de processar o pedido), ou null. */
export function soapFault(xml: string): string | null {
  if (!/<(?:[\w.-]+:)?Fault[\s>]/.test(xml)) return null;
  return tagText(xml, "faultstring") ?? "Erro SOAP sem descrição";
}

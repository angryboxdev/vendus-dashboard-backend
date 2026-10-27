import { createHmac, timingSafeEqual } from "node:crypto";

/** Janela contra repetições: o mesmo que as bibliotecas da Svix (5 minutos para trás ou para a frente). */
export const SIGNATURE_TOLERANCE_S = 5 * 60;

/**
 * Verificação da assinatura dos webhooks da Resend (esquema Svix / Standard Webhooks), sem SDK:
 * HMAC-SHA256 de `<svix-id>.<svix-timestamp>.<corpo ORIGINAL>` com a chave = base64 depois de `whsec_`,
 * comparado em tempo constante com cada assinatura `v1,<base64>` do cabeçalho `svix-signature`.
 * Docs: https://docs.svix.com/receiving/verifying-payloads/how-manual
 */
export function verifySvixSignature(
  secret: string,
  headers: { id: string | undefined; timestamp: string | undefined; signature: string | undefined },
  rawBody: Buffer,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !secret) return false;
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(nowSeconds - ts) > SIGNATURE_TOLERANCE_S) return false;

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret, "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.`).update(rawBody).digest();

  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",", 2);
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

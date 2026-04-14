import { createHmac, timingSafeEqual } from "node:crypto";

const DAY_PREFIX = "kiosk-day:";
const PIN_PREFIX = "kiosk-pin:";

/**
 * Gera o token diário do kiosk: HMAC-SHA256(secret, "kiosk-day:" + dateYmd).
 * Muda todos os dias — links de dias anteriores não são aceites.
 */
export function generateDailyToken(secret: string, dateYmd: string): string {
  return createHmac("sha256", secret).update(DAY_PREFIX + dateYmd).digest("hex");
}

/**
 * Verifica o token diário contra a data indicada.
 * Usa timingSafeEqual para evitar timing attacks.
 */
export function verifyDailyToken(
  secret: string,
  token: string,
  dateYmd: string,
): boolean {
  if (!token || token.length !== 64) return false;
  const expected = generateDailyToken(secret, dateYmd);
  try {
    return timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/**
 * Hash do PIN para guardar na BD: HMAC-SHA256(secret, "kiosk-pin:" + pin).
 * Determinístico — permite pesquisar directamente na BD sem comparar todos os registos.
 * Seguro enquanto o secret for mantido privado (mesmo nível que JWT secrets).
 */
export function hashPin(secret: string, pin: string): string {
  return createHmac("sha256", secret).update(PIN_PREFIX + pin).digest("hex");
}

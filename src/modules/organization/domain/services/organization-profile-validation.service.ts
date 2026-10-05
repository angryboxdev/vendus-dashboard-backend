/**
 * Regras de formato do perfil da organização. Só as regras portuguesas
 * (NIF com dígito de controlo, NISS com 11 dígitos, código postal NNNN-NNN)
 * são verificadas a fundo — para outros países só se exige um valor
 * plausível, nunca se inventa um formato que não conhecemos.
 */

/** NIF português: 9 dígitos, o último é dígito de controlo módulo 11. */
export function isValidPortugueseNif(nif: string): boolean {
  if (!/^\d{9}$/.test(nif)) return false;
  const digits = nif.split("").map(Number);
  const sum = digits.slice(0, 8).reduce((acc, d, i) => acc + d * (9 - i), 0);
  const remainder = sum % 11;
  const check = remainder < 2 ? 0 : 11 - remainder;
  return check === digits[8];
}

/** NISS português: 11 dígitos (sem verificação do dígito de controlo). */
export function isValidPortugueseNiss(niss: string): boolean {
  return /^\d{11}$/.test(niss);
}

export function isValidPortuguesePostalCode(postalCode: string): boolean {
  return /^\d{4}-\d{3}$/.test(postalCode);
}

export function isValidCountryCode(country: string): boolean {
  return /^[A-Z]{2}$/.test(country);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPhone(phone: string): boolean {
  return /^\+?[0-9 ()-]{6,20}$/.test(phone);
}

/** `Intl` é built-in da linguagem (não infraestrutura) — a forma fiável de validar um fuso IANA. */
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("pt-PT", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Aceita "exemplo.pt" e normaliza para "https://exemplo.pt"; devolve null se não for um URL http(s) válido. */
export function normalizeWebsite(website: string): string | null {
  const withScheme = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return null;
    return withScheme;
  } catch {
    return null;
  }
}

/** Remove espaços/pontos que o utilizador costuma colar num NIF/NISS ("123 456 789"). */
export function normalizeTaxId(value: string): string {
  return value.replace(/[\s.]/g, "").toUpperCase();
}

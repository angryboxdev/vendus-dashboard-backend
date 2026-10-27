/**
 * Endereço de receção de faturas de uma empresa: `<localPart>@<domínio>`. O `localPart` é aleatório, não
 * sequencial (difícil de adivinhar); há um só ativo por empresa e os antigos ficam como histórico.
 */
export type InboundAddressStatus = "active" | "inactive";

export interface InboundAddress {
  id: string;
  localPart: string;
  status: InboundAddressStatus;
  createdAt: Date;
  createdBy: string | null;
  deactivatedAt: Date | null;
  deactivatedBy: string | null;
  deactivationReason: string | null;
}

/** Alfabeto sem caracteres ambíguos (sem 0/o, 1/l/i) — fácil de ditar e de copiar. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const LOCAL_PART_LENGTH = 16;

/**
 * Gera o identificador a partir de bytes aleatórios (vindos de uma fonte criptográfica, fora do domínio).
 * 16 caracteres de 31 símbolos ≈ 79 bits — impossível de adivinhar por tentativa.
 */
export function localPartFromRandomBytes(bytes: Uint8Array): string {
  if (bytes.length < LOCAL_PART_LENGTH) throw new Error(`need at least ${LOCAL_PART_LENGTH} random bytes`);
  let out = "";
  for (let i = 0; i < LOCAL_PART_LENGTH; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

/**
 * Regra para eventos atrasados (ex.: chegou depois de gerar um endereço novo): vale a hora a que a Resend
 * RECEBEU o email. O endereço aceita-o se já existia e ainda não estava desativado nesse momento — um email
 * enviado para o endereço antigo antes da rotação ainda entra; depois da rotação, não.
 */
export function addressAcceptedAt(address: Pick<InboundAddress, "createdAt" | "deactivatedAt">, receivedAt: Date): boolean {
  if (receivedAt.getTime() < address.createdAt.getTime()) return false;
  return address.deactivatedAt === null || receivedAt.getTime() < address.deactivatedAt.getTime();
}

export function formatAddress(localPart: string, domain: string): string {
  return `${localPart}@${domain}`;
}

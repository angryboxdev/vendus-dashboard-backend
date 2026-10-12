/**
 * Entidades legais empregadoras (FE-092): denominação, país, identificação
 * fiscal e na Segurança Social, morada e contactos. Nunca se apagam — só se
 * arquivam. O NIF de uma empresa não é dado pessoal.
 *
 * As regras de formato seguem os algoritmos públicos de dígito de controlo;
 * a confirmar com a Contabilidade (a tarefa pede-o) antes de uso oficial.
 */
export type Country = "PT" | "ES";
export type TaxIdType = "nif" | "cif" | "nie";

export const COUNTRIES: { code: Country; label: string; taxIdTypes: { key: TaxIdType; label: string }[]; regionLabel: string; socialSecurityLabel: string }[] = [
  { code: "PT", label: "Portugal", taxIdTypes: [{ key: "nif", label: "NIF / NIPC" }], regionLabel: "Distrito", socialSecurityLabel: "N.º de identificação da entidade empregadora (NISS)" },
  {
    code: "ES",
    label: "Espanha",
    taxIdTypes: [
      { key: "cif", label: "CIF / NIF de sociedade" },
      { key: "nif", label: "NIF (pessoa singular)" },
      { key: "nie", label: "NIE" },
    ],
    regionLabel: "Província",
    socialSecurityLabel: "Código de conta de cotização (CCC)",
  },
];

export interface LegalEntityInput {
  name: string;
  country: Country;
  taxIdType: TaxIdType;
  taxId: string;
  socialSecurityId: string;
  billingEmail: string;
  street: string;
  postalCode: string;
  city: string;
  region: string;
  phone: string | null;
}

export interface LegalEntity extends LegalEntityInput {
  id: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export class LegalEntityError extends Error {
  constructor(
    message: string,
    readonly code: "validation" | "not_found" | "conflict" | "in_use",
    readonly field: string | null = null,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "LegalEntityError";
  }
}

/** Sem espaços, pontos nem hífenes; maiúsculas. */
export const normalizeTaxId = (v: string) => v.replace(/[\s.\-/]/g, "").toUpperCase();

/** NIF/NIPC português: 9 dígitos, dígito de controlo módulo 11. */
export function validPtNif(v: string): boolean {
  if (!/^\d{9}$/.test(v)) return false;
  const sum = [...v.slice(0, 8)].reduce((s, d, i) => s + Number(d) * (9 - i), 0);
  const r = sum % 11;
  return Number(v[8]) === (r < 2 ? 0 : 11 - r);
}

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

/** NIF espanhol de pessoa singular (DNI): 8 dígitos + letra (módulo 23). */
export function validEsNif(v: string): boolean {
  const m = /^(\d{8})([A-Z])$/.exec(v);
  return !!m && DNI_LETTERS[Number(m[1]) % 23] === m[2];
}

/** NIE: X/Y/Z + 7 dígitos + letra (X→0, Y→1, Z→2 e o mesmo cálculo do DNI). */
export function validEsNie(v: string): boolean {
  const m = /^([XYZ])(\d{7})([A-Z])$/.exec(v);
  if (!m) return false;
  const n = Number(`${"XYZ".indexOf(m[1]!)}${m[2]}`);
  return DNI_LETTERS[n % 23] === m[3];
}

/** CIF: letra da forma jurídica + 7 dígitos + controlo (dígito ou letra, conforme a forma). */
export function validEsCif(v: string): boolean {
  const m = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(v);
  if (!m) return false;
  const digits = m[2]!;
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const d = Number(digits[i]);
    if (i % 2 === 0) {
      const x = d * 2;
      sum += Math.floor(x / 10) + (x % 10);
    } else sum += d;
  }
  const control = (10 - (sum % 10)) % 10;
  const letter = "JABCDEFGHI"[control]!;
  const first = m[1]!;
  const given = m[3]!;
  // Só letra: P, Q, R, S, N, W; só dígito: A, B, E, H; as restantes aceitam os dois.
  if ("PQRSNW".includes(first)) return given === letter;
  if ("ABEH".includes(first)) return given === String(control);
  return given === letter || given === String(control);
}

export function validTaxId(country: Country, type: TaxIdType, v: string): boolean {
  if (country === "PT") return type === "nif" && validPtNif(v);
  if (type === "cif") return validEsCif(v);
  if (type === "nif") return validEsNif(v);
  return validEsNie(v);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+[1-9]\d{6,14}$/;

/** Valida e normaliza (o cliente espelha estas regras). */
export function validateLegalEntity(i: LegalEntityInput): LegalEntityInput {
  const fail = (field: string, msg: string): never => {
    throw new LegalEntityError(msg, "validation", field);
  };
  const name = i.name?.trim() ?? "";
  if (name.length < 2 || name.length > 160) fail("name", "A denominação social tem de ter entre 2 e 160 caracteres.");
  const country = COUNTRIES.find((c) => c.code === i.country);
  if (!country) fail("country", "Escolha o país.");
  if (!country!.taxIdTypes.some((t) => t.key === i.taxIdType)) fail("taxIdType", "Tipo de identificação fiscal inválido para o país.");
  const taxId = normalizeTaxId(i.taxId ?? "");
  if (!validTaxId(i.country, i.taxIdType, taxId)) fail("taxId", "Identificação fiscal inválida (formato ou dígito de controlo).");
  const socialSecurityId = (i.socialSecurityId ?? "").replace(/\s/g, "");
  if (!/^\d{11}$/.test(socialSecurityId)) fail("socialSecurityId", "A identificação na Segurança Social tem 11 dígitos.");
  const billingEmail = i.billingEmail?.trim().toLowerCase() ?? "";
  if (!EMAIL.test(billingEmail)) fail("billingEmail", "E-mail de faturação inválido.");
  const street = i.street?.trim() ?? "";
  if (street.length < 2 || street.length > 200) fail("street", "A morada tem de ter entre 2 e 200 caracteres.");
  const postalCode = i.postalCode?.trim() ?? "";
  if (i.country === "PT" ? !/^\d{4}-\d{3}$/.test(postalCode) : !/^\d{5}$/.test(postalCode)) fail("postalCode", i.country === "PT" ? "Código postal no formato 0000-000." : "Código postal com 5 dígitos.");
  const city = i.city?.trim() ?? "";
  if (city.length < 2 || city.length > 80) fail("city", "A localidade tem de ter entre 2 e 80 caracteres.");
  const region = i.region?.trim() ?? "";
  if (region.length < 2 || region.length > 80) fail("region", `Indique o ${country!.regionLabel.toLowerCase()}.`);
  const phone = i.phone?.replace(/\s/g, "") || null;
  if (phone && !PHONE.test(phone)) fail("phone", "Telefone no formato internacional (ex.: +351…).");
  return { name, country: i.country, taxIdType: i.taxIdType, taxId, socialSecurityId, billingEmail, street, postalCode, city, region, phone };
}

/** Campos fiscais: alterá-los numa entidade em uso pede motivo (afeta salários e documentos legais). */
export const FISCAL_FIELDS: (keyof LegalEntityInput)[] = ["taxIdType", "taxId", "socialSecurityId"];

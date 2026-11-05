import type { OrganizationProfileProps } from "../entities/organization-profile.js";
import type { CompanyIssuerData } from "../ports/out/company-issuer-sync.port.js";

/** Telefone no formato da entidade legal (+ e indicativo); outro formato não passa. */
const E164 = /^\+[1-9][0-9]{6,14}$/;

/**
 * A Empresa faz de emitente das faturas: a entidade legal exige razão social,
 * NIF, NISS, e-mail, morada completa e distrito, e só Portugal. Puro: devolve os
 * dados ou os campos (da Empresa) que faltam.
 */
export function companyIssuerData(p: OrganizationProfileProps): { data: CompanyIssuerData } | { missing: string[] } {
  const missing: string[] = [];
  if (p.country !== "PT") missing.push("country");
  if (!p.legalName) missing.push("legalName");
  if (!p.nif) missing.push("nif");
  if (!p.niss) missing.push("niss");
  if (!p.email) missing.push("email");
  if (!p.address) missing.push("address");
  if (!p.postalCode) missing.push("postalCode");
  if (!p.city) missing.push("city");
  if (!p.region) missing.push("region");
  if (missing.length > 0) return { missing };
  const phone = p.phone?.replace(/[\s-]/g, "") ?? null;
  return {
    data: {
      legalName: p.legalName!,
      country: "PT",
      nif: p.nif,
      niss: p.niss!,
      email: p.email!,
      street: p.address!,
      postalCode: p.postalCode!,
      city: p.city!,
      region: p.region!,
      phone: phone && E164.test(phone) ? phone : null,
    },
  };
}

import type { Employee } from "../entities/employee.js";

/**
 * Completude do perfil — funções puras usadas tanto no card "Estado do
 * perfil" do Resumo (Mockup 02) como nos badges "Completo"/"Dados em falta"
 * de cada secção. Conjunto de campos considerado é uma simplificação
 * documentada no README (não configurável por organização nesta fase).
 */

export function isPersonalDataComplete(e: Employee): boolean {
  return !!(e.nif && e.birthDate && e.nationality && e.socialSecurityNumber && e.idCardNumber);
}

export function isAddressComplete(e: Employee): boolean {
  return !!e.address;
}

export function isContractDataComplete(e: Employee): boolean {
  return !!e.hiredAt;
}

export function isBankAccountComplete(e: Employee): boolean {
  return !!e.iban;
}

export function isEmergencyContactComplete(e: Employee): boolean {
  return !!(e.emergencyContactName && e.emergencyContactPhone);
}

export interface ProfileSections {
  personalData: boolean;
  address: boolean;
  contractData: boolean;
  bankAccount: boolean;
  emergencyContact: boolean;
}

export function computeProfileSections(e: Employee): ProfileSections {
  return {
    personalData: isPersonalDataComplete(e),
    address: isAddressComplete(e),
    contractData: isContractDataComplete(e),
    bankAccount: isBankAccountComplete(e),
    emergencyContact: isEmergencyContactComplete(e),
  };
}

/** Percentagem de completude (0-100), arredondada. */
export function computeProfileCompletionPercent(e: Employee): number {
  const sections = computeProfileSections(e);
  const checks = [sections.personalData, sections.address, sections.contractData, sections.bankAccount, sections.emergencyContact, !!e.email, !!e.phone];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

import { Employee } from "../../domain/entities/employee.js";
import {
  computeProfileCompletionPercent,
  computeProfileSections,
} from "../../domain/services/profile-completeness.service.js";

describe("profile-completeness.service", () => {
  it("perfil totalmente vazio: 0% e todas as secções incompletas", () => {
    const e = Employee.create({ fullName: "Andres" });
    const sections = computeProfileSections(e);
    expect(sections).toEqual({
      personalData: false,
      address: false,
      contractData: false,
      bankAccount: false,
      emergencyContact: false,
    });
    expect(computeProfileCompletionPercent(e)).toBe(0);
  });

  it("perfil totalmente preenchido: 100%", () => {
    const e = Employee.create({
      fullName: "Andres",
      email: "andres@angrybox.com",
      phone: "919123456",
      nif: "271234567",
      iban: "PT50...",
      address: "Rua das Flores, 123",
      birthDate: "1994-06-12",
      socialSecurityNumber: "12345678901",
      idCardNumber: "12345678",
      nationality: "Portuguesa",
      hiredAt: "2024-03-01",
      emergencyContactName: "Maria Silva",
      emergencyContactPhone: "912345678",
    });
    expect(computeProfileCompletionPercent(e)).toBe(100);
    expect(computeProfileSections(e).personalData).toBe(true);
  });

  it("personalData exige TODOS os 5 campos (nif/birthDate/nationality/niss/idCard)", () => {
    const e = Employee.create({ fullName: "Andres", nif: "271234567" });
    expect(computeProfileSections(e).personalData).toBe(false);
  });
});

import { Employee } from "../../domain/entities/employee.js";
import { InvalidEmployeeError } from "../../domain/errors.js";

describe("Employee", () => {
  it("cria com defaults (permanent/service/active) e fullName aparado", () => {
    const e = Employee.create({ fullName: "  Andres Silva  " });
    expect(e.fullName).toBe("Andres Silva");
    expect(e.employmentType).toBe("permanent");
    expect(e.jobRole).toBe("service");
    expect(e.status).toBe("active");
    expect(e.photoStoragePath).toBeNull();
  });

  it("rejeita fullName vazio", () => {
    expect(() => Employee.create({ fullName: "   " })).toThrow(InvalidEmployeeError);
  });

  it("update() só altera os campos enviados, preservando o resto", () => {
    const e = Employee.create({ fullName: "Andres Silva", nif: "123456789" });
    const updated = e.update({ phone: "919123456" });
    expect(updated.phone).toBe("919123456");
    expect(updated.nif).toBe("123456789");
    expect(updated.fullName).toBe("Andres Silva");
  });

  it("update() permite limpar um campo explicitamente com null", () => {
    const e = Employee.create({ fullName: "Andres Silva", nif: "123456789" });
    const updated = e.update({ nif: null });
    expect(updated.nif).toBeNull();
  });

  it("deactivate() marca inactive e define endedAt se ainda não tinha", () => {
    const e = Employee.create({ fullName: "Andres Silva" });
    const deactivated = e.deactivate();
    expect(deactivated.status).toBe("inactive");
    expect(deactivated.endedAt).not.toBeNull();
  });

  it("activate() volta a active sem apagar endedAt", () => {
    const e = Employee.create({ fullName: "Andres Silva" }).deactivate();
    const activated = e.activate();
    expect(activated.status).toBe("active");
    expect(activated.endedAt).toBe(e.endedAt);
  });

  it("updatePhoto() define/limpa o photoStoragePath", () => {
    const e = Employee.create({ fullName: "Andres Silva" });
    const withPhoto = e.updatePhoto("org-a/photo.jpg");
    expect(withPhoto.photoStoragePath).toBe("org-a/photo.jpg");
    expect(withPhoto.updatePhoto(null).photoStoragePath).toBeNull();
  });

  it("reconstitute() não revalida (usado a ler da BD)", () => {
    const now = new Date().toISOString();
    const e = Employee.reconstitute({
      id: "e1",
      fullName: "X",
      email: null,
      phone: null,
      roleOrNotes: null,
      employmentType: "permanent",
      jobRole: "service",
      status: "active",
      hiredAt: null,
      endedAt: null,
      baseSalary: null,
      salaryType: "fixed",
      hourlyRate: null,
      nif: null,
      iban: null,
      address: null,
      birthDate: null,
      socialSecurityNumber: null,
      idCardNumber: null,
      nationality: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      photoStoragePath: null,
      createdAt: now,
      updatedAt: now,
    });
    expect(e.id).toBe("e1");
  });
});

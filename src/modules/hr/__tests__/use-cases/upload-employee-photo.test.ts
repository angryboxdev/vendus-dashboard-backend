import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { UploadEmployeePhotoUseCase } from "../../application/use-cases/upload-employee-photo.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHrFileStorage } from "../fakes/fake-hr-file-storage.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
import { EmployeeNotFoundError } from "../../domain/errors.js";

const ORG = mintOrganizationId("org-test");

describe("UploadEmployeePhotoUseCase", () => {
  it("lança EmployeeNotFoundError para id inexistente", async () => {
    const useCase = new UploadEmployeePhotoUseCase(new FakeEmployeeRepository(), new FakeHrFileStorage(), new FakeHrAuditLog());
    await expect(
      useCase.execute({
        organizationId: ORG,
        actor: "a@b.com",
        id: "x",
        buffer: Buffer.from("img"),
        filename: "foto.jpg",
        mimeType: "image/jpeg",
      }),
    ).rejects.toThrow(EmployeeNotFoundError);
  });

  it("guarda a foto, atualiza o colaborador e remove a foto antiga (não deixa órfãos)", async () => {
    const employees = new FakeEmployeeRepository();
    const storage = new FakeHrFileStorage();
    const auditLog = new FakeHrAuditLog();
    const e = Employee.create({ fullName: "Andres Silva" }).updatePhoto("fake/photo/0/old.jpg");
    employees.seed(ORG, e);

    const useCase = new UploadEmployeePhotoUseCase(employees, storage, auditLog);
    const result = await useCase.execute({
      organizationId: ORG,
      actor: "a@b.com",
      id: e.id,
      buffer: Buffer.from("img"),
      filename: "andres.jpg",
      mimeType: "image/jpeg",
    });

    expect(result.photoUrl).toContain("andres.jpg");
    expect(storage.removed).toContainEqual({ kind: "photo", path: "fake/photo/0/old.jpg" });
    const updated = await employees.findById(ORG, e.id);
    expect(updated!.photoStoragePath).not.toBe("fake/photo/0/old.jpg");
    expect(auditLog.entries[0]!.action).toBe("employee_photo_updated");
  });
});

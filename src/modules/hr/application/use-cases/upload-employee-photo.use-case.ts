import { randomUUID } from "crypto";
import { EmployeeNotFoundError } from "../../domain/errors.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { HrFileStoragePort } from "../../domain/ports/out/hr-file-storage.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { UploadEmployeePhotoCommand, UploadEmployeePhotoPort } from "../../domain/ports/in/employee.ports.js";
import { PHOTO_SIGNED_URL_TTL_SECONDS } from "./shared.js";

export class UploadEmployeePhotoUseCase implements UploadEmployeePhotoPort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly hrFileStorage: HrFileStoragePort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: UploadEmployeePhotoCommand): Promise<{ photoUrl: string }> {
    const existing = await this.employeeRepository.findById(command.organizationId, command.id);
    if (!existing) throw new EmployeeNotFoundError(command.id);

    const previousPhotoPath = existing.photoStoragePath;

    const storagePath = await this.hrFileStorage.store(
      "photo",
      command.buffer,
      command.filename,
      command.mimeType,
      command.organizationId,
    );

    const updated = existing.updatePhoto(storagePath);
    await this.employeeRepository.update(command.organizationId, updated);

    if (previousPhotoPath) {
      await this.hrFileStorage.remove("photo", previousPhotoPath, command.organizationId).catch(() => {});
    }

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "employee",
      entityId: existing.id,
      employeeId: existing.id,
      action: "employee_photo_updated",
      description: `Foto de ${existing.fullName} atualizada`,
      correlationId: randomUUID(),
    });

    const photoUrl = await this.hrFileStorage.getSignedUrl(
      "photo",
      storagePath,
      PHOTO_SIGNED_URL_TTL_SECONDS,
      command.organizationId,
    );
    return { photoUrl };
  }
}

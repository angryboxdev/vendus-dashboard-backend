import { DocumentCategoryConfigNotFoundError } from "../../domain/errors.js";
import type { DocumentCategoryRepositoryPort } from "../../domain/ports/out/document-category-repository.port.js";
import type {
  UpdateDocumentCategoryCommand,
  UpdateDocumentCategoryPort,
  DocumentCategoryDTO,
} from "../../domain/ports/in/document-category.ports.js";
import { toDocumentCategoryDTO } from "./shared.js";

export class UpdateDocumentCategoryUseCase implements UpdateDocumentCategoryPort {
  constructor(private readonly documentCategoryRepository: DocumentCategoryRepositoryPort) {}

  async execute(command: UpdateDocumentCategoryCommand): Promise<DocumentCategoryDTO> {
    const existing = await this.documentCategoryRepository.findById(command.organizationId, command.id);
    if (!existing) throw new DocumentCategoryConfigNotFoundError(command.id);

    const updated = existing.update({
      ...(command.label !== undefined && { label: command.label.trim() }),
      ...(command.mandatory !== undefined && { mandatory: command.mandatory }),
      ...(command.jobRoles !== undefined && { jobRoles: command.jobRoles }),
      ...(command.positionIds !== undefined && { positionIds: command.positionIds }),
      ...(command.acceptedMimeTypes !== undefined && { acceptedMimeTypes: command.acceptedMimeTypes }),
      ...(command.scope !== undefined && { scope: command.scope }),
    });
    const saved = await this.documentCategoryRepository.update(command.organizationId, updated);
    return toDocumentCategoryDTO(saved);
  }
}

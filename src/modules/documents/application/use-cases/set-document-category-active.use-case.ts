import { DocumentCategoryConfigNotFoundError } from "../../domain/errors.js";
import type { DocumentCategoryRepositoryPort } from "../../domain/ports/out/document-category-repository.port.js";
import type {
  SetDocumentCategoryActiveCommand,
  SetDocumentCategoryActivePort,
  DocumentCategoryDTO,
} from "../../domain/ports/in/document-category.ports.js";
import { toDocumentCategoryDTO } from "./shared.js";

/** Ativar/desativar — nunca apaga (mesma filosofia do módulo: documentos já enviados numa categoria desativada continuam visíveis/preservados). */
export class SetDocumentCategoryActiveUseCase implements SetDocumentCategoryActivePort {
  constructor(private readonly documentCategoryRepository: DocumentCategoryRepositoryPort) {}

  async execute(command: SetDocumentCategoryActiveCommand): Promise<DocumentCategoryDTO> {
    const existing = await this.documentCategoryRepository.findById(command.organizationId, command.id);
    if (!existing) throw new DocumentCategoryConfigNotFoundError(command.id);

    const updated = existing.setActive(command.active);
    const saved = await this.documentCategoryRepository.update(command.organizationId, updated);
    return toDocumentCategoryDTO(saved);
  }
}

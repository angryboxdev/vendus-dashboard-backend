import type { DocumentCategoryRepositoryPort } from "../../domain/ports/out/document-category-repository.port.js";
import type {
  ListDocumentCategoriesCommand,
  ListDocumentCategoriesPort,
  DocumentCategoryDTO,
} from "../../domain/ports/in/document-category.ports.js";
import { toDocumentCategoryDTO } from "./shared.js";

export class ListDocumentCategoriesUseCase implements ListDocumentCategoriesPort {
  constructor(private readonly documentCategoryRepository: DocumentCategoryRepositoryPort) {}

  async execute(command: ListDocumentCategoriesCommand): Promise<DocumentCategoryDTO[]> {
    const definitions = await this.documentCategoryRepository.findMany(command.organizationId);
    return definitions.map(toDocumentCategoryDTO);
  }
}

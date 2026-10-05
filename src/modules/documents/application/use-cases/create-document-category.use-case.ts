import { DocumentCategoryDefinition } from "../../domain/entities/document-category.js";
import { InvalidDocumentError, DocumentCategoryConfigAlreadyExistsError } from "../../domain/errors.js";
import type { DocumentCategoryRepositoryPort } from "../../domain/ports/out/document-category-repository.port.js";
import type {
  CreateDocumentCategoryCommand,
  CreateDocumentCategoryPort,
  DocumentCategoryDTO,
} from "../../domain/ports/in/document-category.ports.js";
import { toDocumentCategoryDTO } from "./shared.js";

/** Gera um slug estável a partir do label (minúsculas, sem acentos, `_` em vez de espaços/símbolos). */
export function slugifyLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export class CreateDocumentCategoryUseCase implements CreateDocumentCategoryPort {
  constructor(private readonly documentCategoryRepository: DocumentCategoryRepositoryPort) {}

  async execute(command: CreateDocumentCategoryCommand): Promise<DocumentCategoryDTO> {
    const label = command.label.trim();
    if (label.length === 0) throw new InvalidDocumentError("label é obrigatório");

    const slug = slugifyLabel(label);
    if (slug.length === 0) throw new InvalidDocumentError("label inválido");

    const existing = await this.documentCategoryRepository.findBySlug(command.organizationId, slug);
    if (existing) throw new DocumentCategoryConfigAlreadyExistsError(label);

    const definition = DocumentCategoryDefinition.create({
      organizationId: String(command.organizationId),
      slug,
      label,
      mandatory: command.mandatory,
      jobRoles: command.jobRoles,
      ...(command.positionIds !== undefined && { positionIds: command.positionIds }),
      acceptedMimeTypes: command.acceptedMimeTypes,
      ...(command.scope !== undefined && { scope: command.scope }),
    });
    const created = await this.documentCategoryRepository.create(command.organizationId, definition);
    return toDocumentCategoryDTO(created);
  }
}

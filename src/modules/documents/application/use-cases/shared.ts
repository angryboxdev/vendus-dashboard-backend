import type { DocumentCategoryDefinition } from "../../domain/entities/document-category.js";
import type { DocumentCategoryDTO } from "../../domain/ports/in/document-category.ports.js";

export function toDocumentCategoryDTO(def: DocumentCategoryDefinition): DocumentCategoryDTO {
  return {
    id: def.id,
    slug: def.slug,
    label: def.label,
    mandatory: def.mandatory,
    positionIds: def.positionIds,
    acceptedMimeTypes: def.acceptedMimeTypes,
    scope: def.scope,
    requiresPeriod: def.requiresPeriod,
    active: def.active,
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
  };
}

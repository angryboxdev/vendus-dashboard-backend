import type { JobRole } from "./employee.js";

export interface DocumentCategoryDefinitionProps {
  id: string;
  organizationId: string;
  slug: string;
  label: string;
  mandatory: boolean;
  /** Vazio = aplica-se a todos os cargos. */
  jobRoles: JobRole[];
  acceptedMimeTypes: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Definição configurável de uma categoria de documento (RH). Não inclui as
 * 3 categorias fixas de identificação (cartao_cidadao/titulo_residencia/
 * passaporte) — essas continuam uma constante do código, fora desta
 * entidade (ver document-status.service.ts, decisão confirmada com o
 * utilizador).
 */
export class DocumentCategoryDefinition {
  readonly id: string;
  readonly organizationId: string;
  readonly slug: string;
  readonly label: string;
  readonly mandatory: boolean;
  readonly jobRoles: JobRole[];
  readonly acceptedMimeTypes: string[];
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;

  private constructor(props: DocumentCategoryDefinitionProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.slug = props.slug;
    this.label = props.label;
    this.mandatory = props.mandatory;
    this.jobRoles = props.jobRoles;
    this.acceptedMimeTypes = props.acceptedMimeTypes;
    this.active = props.active;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    organizationId: string;
    slug: string;
    label: string;
    mandatory: boolean;
    jobRoles: JobRole[];
    acceptedMimeTypes: string[];
  }): DocumentCategoryDefinition {
    const now = new Date().toISOString();
    return new DocumentCategoryDefinition({
      id: crypto.randomUUID(),
      organizationId: props.organizationId,
      slug: props.slug,
      label: props.label,
      mandatory: props.mandatory,
      jobRoles: props.jobRoles,
      acceptedMimeTypes: props.acceptedMimeTypes,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: DocumentCategoryDefinitionProps): DocumentCategoryDefinition {
    return new DocumentCategoryDefinition(props);
  }

  update(patch: Partial<Pick<DocumentCategoryDefinitionProps, "label" | "mandatory" | "jobRoles" | "acceptedMimeTypes">>): DocumentCategoryDefinition {
    return new DocumentCategoryDefinition({
      ...this.toProps(),
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  setActive(active: boolean): DocumentCategoryDefinition {
    return new DocumentCategoryDefinition({ ...this.toProps(), active, updatedAt: new Date().toISOString() });
  }

  toProps(): DocumentCategoryDefinitionProps {
    return {
      id: this.id,
      organizationId: this.organizationId,
      slug: this.slug,
      label: this.label,
      mandatory: this.mandatory,
      jobRoles: this.jobRoles,
      acceptedMimeTypes: this.acceptedMimeTypes,
      active: this.active,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

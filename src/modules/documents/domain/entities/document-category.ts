/**
 * Categoria operacional do colaborador (antiga "Função": manager|prep|service).
 * Declarada aqui e não importada do `hr` para o motor de documentos não
 * depender do RH (o `JobRole` do RH é estruturalmente o mesmo tipo).
 */
export type OperationalCategory = "manager" | "prep" | "service";

/**
 * Âmbito da categoria (task Base Organizacional §11): para que dono a
 * categoria existe. Só `employee`/`both` entram nos requisitos dos
 * colaboradores — uma categoria `company` nunca gera "Em falta" individual.
 */
export type DocumentCategoryScope = "employee" | "company" | "both";

export function scopeAllowsOwner(scope: DocumentCategoryScope, ownerType: "employee" | "company"): boolean {
  return scope === "both" || scope === ownerType;
}

export interface DocumentCategoryDefinitionProps {
  id: string;
  organizationId: string;
  slug: string;
  label: string;
  mandatory: boolean;
  /** Vazio = aplica-se a todos os cargos. */
  jobRoles: OperationalCategory[];
  acceptedMimeTypes: string[];
  scope: DocumentCategoryScope;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Definição configurável de uma categoria de documento — da Empresa, do
 * Colaborador ou de ambos (`scope`). Não inclui as
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
  readonly jobRoles: OperationalCategory[];
  readonly acceptedMimeTypes: string[];
  readonly scope: DocumentCategoryScope;
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
    this.scope = props.scope;
    this.active = props.active;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    organizationId: string;
    slug: string;
    label: string;
    mandatory: boolean;
    jobRoles: OperationalCategory[];
    acceptedMimeTypes: string[];
    /** Omissão: `employee` (comportamento anterior à Base Organizacional). */
    scope?: DocumentCategoryScope;
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
      scope: props.scope ?? "employee",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: DocumentCategoryDefinitionProps): DocumentCategoryDefinition {
    return new DocumentCategoryDefinition(props);
  }

  update(patch: Partial<Pick<DocumentCategoryDefinitionProps, "label" | "mandatory" | "jobRoles" | "acceptedMimeTypes" | "scope">>): DocumentCategoryDefinition {
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
      scope: this.scope,
      active: this.active,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

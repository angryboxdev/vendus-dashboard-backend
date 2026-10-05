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
  /** Cargos (`hr_positions`) a que se aplica. Vazio = todos os colaboradores (ticket 09). */
  positionIds: string[];
  acceptedMimeTypes: string[];
  scope: DocumentCategoryScope;
  /**
   * Categoria periódica (ex: Recibo de vencimento, ticket 10): cada documento
   * pertence a um período Mês/Ano, há no máximo um atual por período e
   * nunca gera "Em falta". Definida pela migração, não pelo formulário.
   */
  requiresPeriod: boolean;
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
  readonly positionIds: string[];
  readonly acceptedMimeTypes: string[];
  readonly scope: DocumentCategoryScope;
  readonly requiresPeriod: boolean;
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;

  private constructor(props: DocumentCategoryDefinitionProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.slug = props.slug;
    this.label = props.label;
    this.mandatory = props.mandatory;
    this.positionIds = props.positionIds;
    this.acceptedMimeTypes = props.acceptedMimeTypes;
    this.scope = props.scope;
    this.requiresPeriod = props.requiresPeriod;
    this.active = props.active;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    organizationId: string;
    slug: string;
    label: string;
    mandatory: boolean;
    /** Omissão: [] (todos os colaboradores). */
    positionIds?: string[];
    acceptedMimeTypes: string[];
    /** Omissão: `employee` (comportamento anterior à Base Organizacional). */
    scope?: DocumentCategoryScope;
    /** Omissão: false. */
    requiresPeriod?: boolean;
  }): DocumentCategoryDefinition {
    const now = new Date().toISOString();
    return new DocumentCategoryDefinition({
      id: crypto.randomUUID(),
      organizationId: props.organizationId,
      slug: props.slug,
      label: props.label,
      mandatory: props.mandatory,
      positionIds: props.positionIds ?? [],
      acceptedMimeTypes: props.acceptedMimeTypes,
      scope: props.scope ?? "employee",
      requiresPeriod: props.requiresPeriod ?? false,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: DocumentCategoryDefinitionProps): DocumentCategoryDefinition {
    return new DocumentCategoryDefinition(props);
  }

  update(patch: Partial<Pick<DocumentCategoryDefinitionProps, "label" | "mandatory" | "positionIds" | "acceptedMimeTypes" | "scope">>): DocumentCategoryDefinition {
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
      positionIds: this.positionIds,
      acceptedMimeTypes: this.acceptedMimeTypes,
      scope: this.scope,
      requiresPeriod: this.requiresPeriod,
      active: this.active,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

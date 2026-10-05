import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import {
  DocumentCategoryDefinition,
  type DocumentCategoryScope,
  type OperationalCategory,
} from "../../domain/entities/document-category.js";
import type { DocumentCategoryRepositoryPort } from "../../domain/ports/out/document-category-repository.port.js";

const SELECT = "id, org_id, slug, label, mandatory, job_roles, position_ids, accepted_mime_types, scope, requires_period, active, created_at, updated_at";

interface Row {
  id: string;
  org_id: string;
  slug: string;
  label: string;
  mandatory: boolean;
  job_roles: string[];
  position_ids: string[] | null;
  accepted_mime_types: string[];
  scope: string;
  requires_period: boolean | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function rowToDefinition(row: Row): DocumentCategoryDefinition {
  return DocumentCategoryDefinition.reconstitute({
    id: row.id,
    organizationId: row.org_id,
    slug: row.slug,
    label: row.label,
    mandatory: row.mandatory,
    jobRoles: row.job_roles as OperationalCategory[],
    positionIds: row.position_ids ?? [],
    acceptedMimeTypes: row.accepted_mime_types,
    scope: row.scope as DocumentCategoryScope,
    requiresPeriod: row.requires_period ?? false,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function definitionToRow(def: DocumentCategoryDefinition): Record<string, unknown> {
  const props = def.toProps();
  return {
    id: props.id,
    slug: props.slug,
    label: props.label,
    mandatory: props.mandatory,
    job_roles: props.jobRoles,
    position_ids: props.positionIds,
    accepted_mime_types: props.acceptedMimeTypes,
    scope: props.scope,
    active: props.active,
    updated_at: props.updatedAt,
  };
}

export class SupabaseDocumentCategoryRepository implements DocumentCategoryRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findMany(
    organizationId: OrganizationId,
    opts?: { activeOnly?: boolean },
  ): Promise<DocumentCategoryDefinition[]> {
    let query = this.scopedQuery(organizationId).table("hr_document_categories").select(SELECT).order("label");
    if (opts?.activeOnly) query = query.eq("active", true);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data as unknown as Row[]).map(rowToDefinition);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<DocumentCategoryDefinition | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_document_categories")
      .select(SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return rowToDefinition(data as unknown as Row);
  }

  async findBySlug(organizationId: OrganizationId, slug: string): Promise<DocumentCategoryDefinition | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_document_categories")
      .select(SELECT)
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return rowToDefinition(data as unknown as Row);
  }

  async create(
    organizationId: OrganizationId,
    definition: DocumentCategoryDefinition,
  ): Promise<DocumentCategoryDefinition> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_document_categories")
      .insert(definitionToRow(definition))
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return rowToDefinition(data as unknown as Row);
  }

  async update(
    organizationId: OrganizationId,
    definition: DocumentCategoryDefinition,
  ): Promise<DocumentCategoryDefinition> {
    const { id, ...patch } = definitionToRow(definition);
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_document_categories")
      .update(patch)
      .eq("id", id as string)
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return rowToDefinition(data as unknown as Row);
  }
}

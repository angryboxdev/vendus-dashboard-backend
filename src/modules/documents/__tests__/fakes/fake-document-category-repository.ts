import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { DocumentCategoryDefinition } from "../../domain/entities/document-category.js";
import type { OperationalCategory as JobRole } from "../../domain/entities/document-category.js";
import type { DocumentCategoryRepositoryPort } from "../../domain/ports/out/document-category-repository.port.js";

const DEFAULT_ACCEPTED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];

/**
 * Mesmas 8 categorias semeadas pela migração `20260926150000_hr_document_categories.sql`
 * para cada organização real — replicadas aqui para que os testes que já
 * existiam antes desta feature (e não mexem com categorias) continuem a
 * passar sem alterar nenhuma asserção.
 */
const DEFAULT_SEED: Array<{ slug: string; label: string; mandatory: boolean; jobRoles: JobRole[]; requiresPeriod?: boolean }> = [
  { slug: "contrato_trabalho", label: "Contrato de trabalho", mandatory: true, jobRoles: [] },
  { slug: "comprovativo_iban", label: "Comprovativo de IBAN", mandatory: true, jobRoles: [] },
  { slug: "apolice_seguro_at", label: "Apólice de seguro de acidentes de trabalho", mandatory: true, jobRoles: [] },
  { slug: "certificado_morada", label: "Certificado de morada", mandatory: false, jobRoles: [] },
  { slug: "ficha_colaborador", label: "Ficha de colaborador", mandatory: false, jobRoles: [] },
  { slug: "formacao_seguranca", label: "Formação de segurança", mandatory: false, jobRoles: [] },
  { slug: "atestado_saude", label: "Atestado de saúde", mandatory: false, jobRoles: [] },
  { slug: "nif", label: "NIF", mandatory: false, jobRoles: [] },
  // `20261006120000_payslips_period.sql` (ticket 10).
  { slug: "recibo_vencimento", label: "Recibo de vencimento", mandatory: false, jobRoles: [], requiresPeriod: true },
];

export class FakeDocumentCategoryRepository implements DocumentCategoryRepositoryPort {
  private readonly byOrg = new Map<string, Map<string, DocumentCategoryDefinition>>();
  private readonly seededOrgs = new Set<string>();

  private store(organizationId: OrganizationId): Map<string, DocumentCategoryDefinition> {
    const key = String(organizationId);
    if (!this.byOrg.has(key)) this.byOrg.set(key, new Map());
    if (!this.seededOrgs.has(key)) {
      this.seededOrgs.add(key);
      for (const seed of DEFAULT_SEED) {
        const def = DocumentCategoryDefinition.create({
          organizationId: key,
          slug: seed.slug,
          label: seed.label,
          mandatory: seed.mandatory,
          jobRoles: seed.jobRoles,
          acceptedMimeTypes: seed.requiresPeriod ? ["application/pdf"] : DEFAULT_ACCEPTED_MIME_TYPES,
          requiresPeriod: seed.requiresPeriod ?? false,
        });
        this.byOrg.get(key)!.set(def.id, def);
      }
    }
    return this.byOrg.get(key)!;
  }

  /** Substitui o seed por omissão desta organização por uma lista à escolha do teste. */
  seedOverride(organizationId: OrganizationId, definitions: DocumentCategoryDefinition[]): void {
    const key = String(organizationId);
    this.seededOrgs.add(key);
    const map = new Map<string, DocumentCategoryDefinition>();
    for (const def of definitions) map.set(def.id, def);
    this.byOrg.set(key, map);
  }

  async findMany(
    organizationId: OrganizationId,
    opts?: { activeOnly?: boolean },
  ): Promise<DocumentCategoryDefinition[]> {
    const all = [...this.store(organizationId).values()];
    return opts?.activeOnly ? all.filter((d) => d.active) : all;
  }

  async findById(organizationId: OrganizationId, id: string): Promise<DocumentCategoryDefinition | null> {
    return this.store(organizationId).get(id) ?? null;
  }

  async findBySlug(organizationId: OrganizationId, slug: string): Promise<DocumentCategoryDefinition | null> {
    return [...this.store(organizationId).values()].find((d) => d.slug === slug) ?? null;
  }

  async create(
    organizationId: OrganizationId,
    definition: DocumentCategoryDefinition,
  ): Promise<DocumentCategoryDefinition> {
    this.store(organizationId).set(definition.id, definition);
    return definition;
  }

  async update(
    organizationId: OrganizationId,
    definition: DocumentCategoryDefinition,
  ): Promise<DocumentCategoryDefinition> {
    this.store(organizationId).set(definition.id, definition);
    return definition;
  }
}

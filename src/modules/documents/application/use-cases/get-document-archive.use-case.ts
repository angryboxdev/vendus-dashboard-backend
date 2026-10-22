import type { EmployeeDirectoryPort } from "../../domain/ports/out/employee-directory.port.js";
import type { DocumentRepositoryPort } from "../../domain/ports/out/document-repository.port.js";
import type { DocumentCategoryRepositoryPort } from "../../domain/ports/out/document-category-repository.port.js";
import type { DocumentArchiveRowDTO, GetDocumentArchiveCommand, GetDocumentArchivePort } from "../../domain/ports/in/employee-document.ports.js";

/**
 * Arquivo documental (Novo RH → Mais → Documentos → Colaboradores): por
 * colaborador ativo e categoria, quantos documentos atuais tem e quando foi o
 * último arquivamento. As pastas são do frontend (agrupam categorias); aqui só
 * se conta — uma leitura em lote, nunca por pessoa.
 */
export class GetDocumentArchiveUseCase implements GetDocumentArchivePort {
  constructor(
    private readonly employees: EmployeeDirectoryPort,
    private readonly documents: DocumentRepositoryPort,
    private readonly categories: DocumentCategoryRepositoryPort,
  ) {}

  async execute(command: GetDocumentArchiveCommand): Promise<DocumentArchiveRowDTO[]> {
    const people = await this.employees.findMany(command.organizationId, { status: "active" });
    if (people.length === 0) return [];
    const [docs, defs] = await Promise.all([
      this.documents.findCurrentByOwners(command.organizationId, "employee", people.map((e) => e.id)),
      this.categories.findMany(command.organizationId, { activeOnly: false }),
    ]);
    const periodic = new Set(defs.filter((d) => d.requiresPeriod).map((d) => d.slug));
    const names = new Map(people.map((e) => [e.id, e.fullName]));
    const rows = new Map<string, DocumentArchiveRowDTO>();
    for (const d of docs) {
      if (d.status === "removed" || !names.has(d.ownerId)) continue;
      const key = `${d.ownerId}|${d.category}`;
      const row = rows.get(key) ?? {
        employeeId: d.ownerId,
        employeeName: names.get(d.ownerId)!,
        category: d.category,
        requiresPeriod: periodic.has(d.category),
        count: 0,
        lastUploadedAt: d.uploadedAt,
      };
      row.count += 1;
      if (d.uploadedAt > row.lastUploadedAt) row.lastUploadedAt = d.uploadedAt;
      rows.set(key, row);
    }
    return [...rows.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName, "pt") || a.category.localeCompare(b.category));
  }
}

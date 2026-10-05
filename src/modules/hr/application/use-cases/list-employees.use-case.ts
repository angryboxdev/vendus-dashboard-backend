import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { DocumentRepositoryPort as EmployeeDocumentRepositoryPort } from "../../../documents/domain/ports/out/document-repository.port.js";
import type { HrFileStoragePort } from "../../domain/ports/out/hr-file-storage.port.js";
import type { DocumentCategoryRepositoryPort } from "../../../documents/domain/ports/out/document-category-repository.port.js";
import {
  applicableCategoriesFor,
  buildDynamicRequirements,
  computeMandatoryDocumentsSummary,
  deriveOverallDocumentSituation,
  DEFAULT_MANDATORY_REQUIREMENTS,
} from "../../domain/services/document-status.service.js";
import { computeProfileCompletionPercent } from "../../domain/services/profile-completeness.service.js";
import type {
  ListEmployeesCommand,
  ListEmployeesPort,
  ListEmployeesResultDTO,
  EmployeeListRowDTO,
} from "../../domain/ports/in/employee.ports.js";
import { PHOTO_SIGNED_URL_TTL_SECONDS } from "./shared.js";

/**
 * Filtragem/paginação: busca até ao limite alto do repositório (mesma
 * abordagem já usada pela listagem legacy — ver README), calcula
 * `documentSituation`/completude em memória, aplica `documentSituation` e
 * `search` (que também depende dos documentos) e só então pagina. Não é uma
 * paginação real de servidor para este filtro específico — simplificação
 * documentada.
 */
export class ListEmployeesUseCase implements ListEmployeesPort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly employeeDocumentRepository: EmployeeDocumentRepositoryPort,
    private readonly hrFileStorage: HrFileStoragePort,
    private readonly documentCategoryRepository: DocumentCategoryRepositoryPort,
  ) {}

  async execute(command: ListEmployeesCommand): Promise<ListEmployeesResultDTO> {
    const allEmployees = await this.employeeRepository.findMany(command.organizationId, {
      ...(command.search !== undefined && { search: command.search }),
      status: command.status ?? "all",
      ...(command.employmentType !== undefined && { employmentType: command.employmentType }),
    });
    // Cargo e local filtram em memória sobre o mesmo conjunto (como `documentSituation`).
    // Um colaborador "pertence" a um local se for o principal ou um dos autorizados.
    const employees = allEmployees.filter(
      (e) =>
        (!command.positionId || e.positionId === command.positionId) &&
        (!command.locationId ||
          e.primaryLocationId === command.locationId ||
          e.authorizedLocationIds.includes(command.locationId)),
    );

    const documents = await this.employeeDocumentRepository.findCurrentByOwners(command.organizationId, "employee", employees.map((e) => e.id),
    );
    const categoryDefs = await this.documentCategoryRepository.findMany(command.organizationId, { activeOnly: true });
    const documentsByEmployee = new Map<string, typeof documents>();
    for (const doc of documents) {
      const list = documentsByEmployee.get(doc.ownerId) ?? [];
      list.push(doc);
      documentsByEmployee.set(doc.ownerId, list);
    }

    let rows: EmployeeListRowDTO[] = await Promise.all(
      employees.map(async (employee) => {
        // Documentos obrigatórios e completude de perfil só geram estado de
        // alerta para colaboradores ativos — um inativo não tem ações
        // pendentes por definição (ver README, "Design decisions").
        const isActive = employee.status === "active";
        const applicable = applicableCategoriesFor(categoryDefs, employee);
        const requirements = [...DEFAULT_MANDATORY_REQUIREMENTS, ...buildDynamicRequirements(applicable)];
        const summary = computeMandatoryDocumentsSummary(requirements, documentsByEmployee.get(employee.id) ?? []);
        const photoUrl = employee.photoStoragePath
          ? await this.hrFileStorage.getSignedUrl(
              "photo",
              employee.photoStoragePath,
              PHOTO_SIGNED_URL_TTL_SECONDS,
              command.organizationId,
            )
          : null;
        return {
          id: employee.id,
          fullName: employee.fullName,
          jobRole: employee.jobRole,
          positionId: employee.positionId,
          primaryLocationId: employee.primaryLocationId,
          employmentType: employee.employmentType,
          email: employee.email,
          phone: employee.phone,
          status: employee.status,
          photoUrl,
          profileCompletionPercent: isActive ? computeProfileCompletionPercent(employee) : 100,
          documentSituation: isActive ? deriveOverallDocumentSituation(summary) : "ok",
          updatedAt: employee.updatedAt,
        };
      }),
    );

    if (command.documentSituation) {
      rows = rows.filter((r) => r.documentSituation === command.documentSituation);
    }
    if (command.profileComplete) {
      rows = rows.filter((r) =>
        command.profileComplete === "complete" ? r.profileCompletionPercent === 100 : r.profileCompletionPercent < 100,
      );
    }

    const total = rows.length;
    const start = (command.page - 1) * command.pageSize;
    const items = rows.slice(start, start + command.pageSize);

    return { items, total, page: command.page, pageSize: command.pageSize };
  }
}

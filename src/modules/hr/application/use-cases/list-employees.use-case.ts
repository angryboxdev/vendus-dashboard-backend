import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { EmployeeDocumentRepositoryPort } from "../../domain/ports/out/employee-document-repository.port.js";
import type { HrFileStoragePort } from "../../domain/ports/out/hr-file-storage.port.js";
import {
  computeMandatoryDocumentsSummary,
  deriveOverallDocumentSituation,
  DEFAULT_MANDATORY_CATEGORIES,
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
  ) {}

  async execute(command: ListEmployeesCommand): Promise<ListEmployeesResultDTO> {
    const employees = await this.employeeRepository.findMany(command.organizationId, {
      ...(command.search !== undefined && { search: command.search }),
      status: command.status ?? "all",
      ...(command.employmentType !== undefined && { employmentType: command.employmentType }),
    });

    const documents = await this.employeeDocumentRepository.findCurrentByEmployeeIds(
      command.organizationId,
      employees.map((e) => e.id),
    );
    const documentsByEmployee = new Map<string, typeof documents>();
    for (const doc of documents) {
      const list = documentsByEmployee.get(doc.employeeId) ?? [];
      list.push(doc);
      documentsByEmployee.set(doc.employeeId, list);
    }

    let rows: EmployeeListRowDTO[] = await Promise.all(
      employees.map(async (employee) => {
        const summary = computeMandatoryDocumentsSummary(
          DEFAULT_MANDATORY_CATEGORIES,
          documentsByEmployee.get(employee.id) ?? [],
        );
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
          employmentType: employee.employmentType,
          email: employee.email,
          phone: employee.phone,
          status: employee.status,
          photoUrl,
          profileCompletionPercent: computeProfileCompletionPercent(employee),
          documentSituation: deriveOverallDocumentSituation(summary),
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

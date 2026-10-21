import type { DocumentRepositoryPort as EmployeeDocumentRepositoryPort } from "../../domain/ports/out/document-repository.port.js";
import type {
  ListEmployeeDocumentsCommand,
  ListEmployeeDocumentsPort,
  EmployeeDocumentDTO,
} from "../../domain/ports/in/employee-document.ports.js";
import { toEmployeeDocumentDTO } from "./employee-document-shared.js";

export class ListEmployeeDocumentsUseCase implements ListEmployeeDocumentsPort {
  constructor(private readonly employeeDocumentRepository: EmployeeDocumentRepositoryPort) {}

  async execute(command: ListEmployeeDocumentsCommand): Promise<EmployeeDocumentDTO[]> {
    const documents = await this.employeeDocumentRepository.findCurrentByOwners(command.organizationId, "employee", [command.employeeId]);
    return documents.map(toEmployeeDocumentDTO);
  }
}

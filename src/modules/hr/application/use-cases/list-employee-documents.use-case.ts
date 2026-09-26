import type { EmployeeDocumentRepositoryPort } from "../../domain/ports/out/employee-document-repository.port.js";
import type {
  ListEmployeeDocumentsCommand,
  ListEmployeeDocumentsPort,
  EmployeeDocumentDTO,
} from "../../domain/ports/in/employee-document.ports.js";
import { toEmployeeDocumentDTO } from "./shared.js";

export class ListEmployeeDocumentsUseCase implements ListEmployeeDocumentsPort {
  constructor(private readonly employeeDocumentRepository: EmployeeDocumentRepositoryPort) {}

  async execute(command: ListEmployeeDocumentsCommand): Promise<EmployeeDocumentDTO[]> {
    const documents = await this.employeeDocumentRepository.findCurrentByEmployeeId(
      command.organizationId,
      command.employeeId,
    );
    return documents.map(toEmployeeDocumentDTO);
  }
}

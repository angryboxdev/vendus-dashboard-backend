import { EmployeeDocumentNotFoundError } from "../../domain/errors.js";
import type { EmployeeDocumentRepositoryPort } from "../../domain/ports/out/employee-document-repository.port.js";
import type {
  GetEmployeeDocumentHistoryCommand,
  GetEmployeeDocumentHistoryPort,
  EmployeeDocumentDTO,
} from "../../domain/ports/in/employee-document.ports.js";
import { toEmployeeDocumentDTO } from "./shared.js";

export class GetEmployeeDocumentHistoryUseCase implements GetEmployeeDocumentHistoryPort {
  constructor(private readonly employeeDocumentRepository: EmployeeDocumentRepositoryPort) {}

  async execute(command: GetEmployeeDocumentHistoryCommand): Promise<EmployeeDocumentDTO[]> {
    const doc = await this.employeeDocumentRepository.findById(command.organizationId, command.documentId);
    if (!doc || doc.employeeId !== command.employeeId) {
      throw new EmployeeDocumentNotFoundError(command.documentId);
    }
    const history = await this.employeeDocumentRepository.findVersionHistory(
      command.organizationId,
      command.employeeId,
      doc.category,
    );
    return history.map(toEmployeeDocumentDTO);
  }
}

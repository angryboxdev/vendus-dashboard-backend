import { EmployeeDocumentNotFoundError } from "../../domain/errors.js";
import type { DocumentRepositoryPort as EmployeeDocumentRepositoryPort } from "../../../documents/domain/ports/out/document-repository.port.js";
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
    if (!doc || doc.ownerId !== command.employeeId) {
      throw new EmployeeDocumentNotFoundError(command.documentId);
    }
    const history = await this.employeeDocumentRepository.findVersionHistory(command.organizationId, "employee", command.employeeId,
      doc.category,
    );
    // Categoria periódica: o histórico é o do período (cada recibo tem o seu).
    return history.filter((d) => d.period === doc.period).map(toEmployeeDocumentDTO);
  }
}

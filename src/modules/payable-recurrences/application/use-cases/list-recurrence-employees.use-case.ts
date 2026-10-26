import type { EmployeeDirectoryReadPort } from "../../domain/ports/out/employee-directory-read.port.js";
import type {
  ListRecurrenceEmployeesPort,
  ListRecurrenceEmployeesQuery,
  RecurrenceEmployeeDTO,
} from "../../domain/ports/in/recurrence.ports.js";

/** Colaboradores do RH para associar a uma recorrência de salários (ativos e inativos — o formulário filtra). */
export class ListRecurrenceEmployeesUseCase implements ListRecurrenceEmployeesPort {
  constructor(private readonly employees: EmployeeDirectoryReadPort) {}

  async execute(query: ListRecurrenceEmployeesQuery): Promise<RecurrenceEmployeeDTO[]> {
    const list = await this.employees.findAll(query.organizationId);
    return list.map((e) => ({ id: e.id, fullName: e.fullName, status: e.status }));
  }
}

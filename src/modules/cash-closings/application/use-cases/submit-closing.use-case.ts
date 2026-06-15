import { CashClosing } from "../../domain/entities/cash-closing.js";
import { DuplicateClosingError, EmployeeNotFoundError } from "../../domain/errors.js";
import type { SubmitClosingPort, SubmitClosingCommand } from "../../domain/ports/in/submit-closing.port.js";
import type { CashClosingDto } from "../../domain/ports/in/shared-dto.js";
import type { CashClosingRepositoryPort } from "../../domain/ports/out/cash-closing-repository.port.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { VendusRegisterSessionsGatewayPort } from "../../domain/ports/out/vendus-register-sessions-gateway.port.js";

export class SubmitClosingUseCase implements SubmitClosingPort {
  private readonly closingRepository: CashClosingRepositoryPort;
  private readonly employeeRepository: EmployeeRepositoryPort;
  private readonly sessionsGateway: VendusRegisterSessionsGatewayPort;

  constructor(
    closingRepository: CashClosingRepositoryPort,
    employeeRepository: EmployeeRepositoryPort,
    sessionsGateway: VendusRegisterSessionsGatewayPort,
  ) {
    this.closingRepository = closingRepository;
    this.employeeRepository = employeeRepository;
    this.sessionsGateway = sessionsGateway;
  }

  async execute(command: SubmitClosingCommand): Promise<CashClosingDto> {
    const employee = await this.employeeRepository.findActiveById(command.employeeId);
    if (!employee) throw new EmployeeNotFoundError(command.employeeId);

    const sessionOpenedAt = command.sessionOpenedAt ?? null;

    // Duplicate check: modo sessions usa a sessão como chave; modo legado usa employee+date.
    if (sessionOpenedAt) {
      const isDuplicate = await this.closingRepository.existsForSession(sessionOpenedAt);
      if (isDuplicate) throw new DuplicateClosingError(command.employeeId, command.closingDate);
    } else {
      const isDuplicate = await this.closingRepository.existsForEmployeeOnDate(
        command.employeeId,
        command.closingDate,
      );
      if (isDuplicate) throw new DuplicateClosingError(command.employeeId, command.closingDate);
    }

    // Total Vendus: best-effort — se a API falhar não impede a submissão.
    let vendusTotal: number | null = null;
    try {
      if (sessionOpenedAt) {
        vendusTotal = await this.sessionsGateway.getSessionTotal(
          command.closingDate,
          sessionOpenedAt,
        );
      }
    } catch {
      // silently ignored
    }

    const closing = CashClosing.create({
      employeeId: command.employeeId,
      employeeName: employee.fullName,
      closingDate: command.closingDate,
      tpa: command.tpa,
      uber: command.uber,
      glovo: command.glovo,
      bolt: command.bolt,
      eatz: command.eatz,
      cashSales: command.cashSales,
      cashIn: command.cashIn,
      cashOut: command.cashOut,
      cashDrawerOpen: command.cashDrawerOpen,
      cashDrawerTotal: command.cashDrawerTotal,
      vendusTotal,
      notes: command.notes,
      sessionOpenedAt,
      drawerDenominations: command.drawerDenominations,
    });

    await this.closingRepository.save(closing);
    return toDto(closing);
  }
}

export function toDto(closing: CashClosing): CashClosingDto {
  return {
    id: closing.id,
    closingDate: closing.closingDate,
    employeeId: closing.employeeId,
    employeeName: closing.employeeName,
    tpa: closing.tpa,
    uber: closing.uber,
    glovo: closing.glovo,
    bolt: closing.bolt,
    eatz: closing.eatz,
    cashSales: closing.cashSales,
    cashIn: closing.cashIn,
    cashOut: closing.cashOut,
    cashDrawerOpen: closing.cashDrawerOpen,
    cashDrawerTotal: closing.cashDrawerTotal,
    totalCalculated: closing.totalCalculated,
    vendusTotal: closing.vendusTotal,
    sangriaAmount: closing.sangriaAmount,
    notes: closing.notes,
    status: closing.status,
    managerNotes: closing.managerNotes,
    reviewedAt: closing.reviewedAt,
    submittedAt: closing.submittedAt,
    sessionOpenedAt: closing.sessionOpenedAt,
    drawerDenominations: closing.drawerDenominations,
  };
}

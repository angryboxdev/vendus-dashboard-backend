import { CashClosing } from "../../domain/entities/cash-closing.js";
import { DuplicateClosingError, RateLimitExceededError } from "../../domain/errors.js";
import type { SubmitClosingPort, SubmitClosingCommand } from "../../domain/ports/in/submit-closing.port.js";
import type { VerifyPinPort } from "../../domain/ports/in/verify-pin.port.js";
import type { CashClosingDto } from "../../domain/ports/in/shared-dto.js";
import type { CashClosingRepositoryPort } from "../../domain/ports/out/cash-closing-repository.port.js";
import type { SubmitRateLimiterPort } from "../../domain/ports/out/submit-rate-limiter.port.js";
import type { VendusRegisterSessionsGatewayPort } from "../../domain/ports/out/vendus-register-sessions-gateway.port.js";
import type { AirMenuDeliveryGatewayPort } from "../../domain/ports/out/air-menu-delivery-gateway.port.js";

export class SubmitClosingUseCase implements SubmitClosingPort {
  private readonly closingRepository: CashClosingRepositoryPort;
  private readonly verifyPin: VerifyPinPort;
  private readonly rateLimiter: SubmitRateLimiterPort;
  private readonly sessionsGateway: VendusRegisterSessionsGatewayPort;
  private readonly airMenuGateway: AirMenuDeliveryGatewayPort | undefined;

  constructor(
    closingRepository: CashClosingRepositoryPort,
    verifyPin: VerifyPinPort,
    rateLimiter: SubmitRateLimiterPort,
    sessionsGateway: VendusRegisterSessionsGatewayPort,
    airMenuGateway?: AirMenuDeliveryGatewayPort,
  ) {
    this.closingRepository = closingRepository;
    this.verifyPin = verifyPin;
    this.rateLimiter = rateLimiter;
    this.sessionsGateway = sessionsGateway;
    this.airMenuGateway = airMenuGateway;
  }

  async execute(command: SubmitClosingCommand): Promise<CashClosingDto> {
    if (!this.rateLimiter.checkAndRecord(command.locationId)) {
      throw new RateLimitExceededError(command.locationId);
    }

    const { employeeId, fullName } = await this.verifyPin.execute({
      organizationId: command.organizationId,
      pin: command.pin,
    });

    const sessionOpenedAt = command.sessionOpenedAt ?? null;

    // Duplicate check: modo sessions usa a sessão como chave; modo legado usa employee+date.
    if (sessionOpenedAt) {
      const isDuplicate = await this.closingRepository.existsForSession(
        command.organizationId,
        sessionOpenedAt,
      );
      if (isDuplicate) throw new DuplicateClosingError(employeeId, command.closingDate);
    } else {
      const isDuplicate = await this.closingRepository.existsForEmployeeOnDate(
        command.organizationId,
        employeeId,
        command.closingDate,
      );
      if (isDuplicate) throw new DuplicateClosingError(employeeId, command.closingDate);
    }

    // Total Vendus (canal próprio): best-effort — se a API falhar não impede a submissão.
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

    // Totais AirMenu (canais externos): best-effort — se a API falhar ficam null.
    let airMenuUber: number | null = null;
    let airMenuGlovo: number | null = null;
    let airMenuBolt: number | null = null;
    if (this.airMenuGateway) {
      try {
        const totals = await this.airMenuGateway.getDeliveryTotalsForDate(command.closingDate);
        airMenuUber = totals.uber;
        airMenuGlovo = totals.glovo;
        airMenuBolt = totals.bolt;
      } catch {
        // silently ignored
      }
    }

    const closing = CashClosing.create({
      employeeId,
      employeeName: fullName,
      locationId: command.locationId,
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
      airMenuUber,
      airMenuGlovo,
      airMenuBolt,
    });

    await this.closingRepository.save(command.organizationId, closing);
    return toDto(closing);
  }
}

export function toDto(closing: CashClosing): CashClosingDto {
  return {
    id: closing.id,
    closingDate: closing.closingDate,
    employeeId: closing.employeeId,
    employeeName: closing.employeeName,
    locationId: closing.locationId,
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
    airMenuUber: closing.airMenuUber,
    airMenuGlovo: closing.airMenuGlovo,
    airMenuBolt: closing.airMenuBolt,
    vendusCalculated: closing.vendusCalculated,
    airMenuCalculated: closing.airMenuCalculated,
    airMenuTotal:
      closing.airMenuUber !== null && closing.airMenuGlovo !== null && closing.airMenuBolt !== null
        ? Math.round((closing.airMenuUber + closing.airMenuGlovo + closing.airMenuBolt) * 100) / 100
        : null,
  };
}

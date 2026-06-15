import type {
  GetAvailableSessionsPort,
  GetAvailableSessionsQuery,
  RegisterSessionDto,
} from "../../domain/ports/in/get-available-sessions.port.js";
import type { VendusRegisterSessionsGatewayPort } from "../../domain/ports/out/vendus-register-sessions-gateway.port.js";
import type { CashClosingRepositoryPort } from "../../domain/ports/out/cash-closing-repository.port.js";

export class GetAvailableSessionsUseCase implements GetAvailableSessionsPort {
  private readonly sessionsGateway: VendusRegisterSessionsGatewayPort;
  private readonly closingRepository: CashClosingRepositoryPort;

  constructor(
    sessionsGateway: VendusRegisterSessionsGatewayPort,
    closingRepository: CashClosingRepositoryPort,
  ) {
    this.sessionsGateway = sessionsGateway;
    this.closingRepository = closingRepository;
  }

  async execute(query: GetAvailableSessionsQuery): Promise<RegisterSessionDto[]> {
    const sessions = await this.sessionsGateway.getSessionsForDate(query.date);

    const result = await Promise.all(
      sessions.map(async (s): Promise<RegisterSessionDto> => {
        const alreadySubmitted = await this.closingRepository.existsForSession(s.openedAt);
        return { ...s, alreadySubmitted };
      }),
    );

    return result;
  }
}

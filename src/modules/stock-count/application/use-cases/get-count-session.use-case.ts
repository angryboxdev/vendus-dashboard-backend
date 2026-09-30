import { StockCountSessionNotFoundError } from "../../domain/errors.js";
import type { GetCountSessionCommand, GetCountSessionPort, StockCountSessionDTO } from "../../domain/ports/in/stock-count.ports.js";
import type { StockCountRepositoryPort } from "../../domain/ports/out/stock-count-repository.port.js";
import { buildSessionDTO } from "./shared.js";

export class GetCountSessionUseCase implements GetCountSessionPort {
  constructor(private readonly repository: StockCountRepositoryPort) {}

  async execute(command: GetCountSessionCommand): Promise<StockCountSessionDTO> {
    const session = await this.repository.findSessionById(command.organizationId, command.sessionId);
    if (!session) throw new StockCountSessionNotFoundError(command.sessionId);
    const lines = await this.repository.findLinesBySessionId(command.organizationId, command.sessionId);
    return buildSessionDTO(this.repository, command.organizationId, session, lines);
  }
}

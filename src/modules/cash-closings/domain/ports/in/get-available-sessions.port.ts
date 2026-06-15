import type { RegisterSession } from "../../entities/register-session.js";

/** Sessão enriquecida com flag de submissão — usada como DTO de saída. */
export interface RegisterSessionDto extends RegisterSession {
  /** true se já existe um fecho registado no nosso sistema para esta sessão. */
  alreadySubmitted: boolean;
}

export interface GetAvailableSessionsQuery {
  date: string;
}

export interface GetAvailableSessionsPort {
  execute(query: GetAvailableSessionsQuery): Promise<RegisterSessionDto[]>;
}

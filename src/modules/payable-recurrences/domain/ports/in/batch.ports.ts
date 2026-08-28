import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { OccurrenceDTO } from "./occurrence.ports.js";

export interface GenerateBatchCommand {
  organizationId: OrganizationId;
  year: number;
  month: number; // 1-based
}

export interface BatchGenerationResult {
  period: string; // YYYY-MM
  generated: OccurrenceDTO[];
  skippedAlreadyExists: number;
  skippedOutOfScope: number;
}

export interface GenerateBatchOccurrencesPort {
  execute(command: GenerateBatchCommand): Promise<BatchGenerationResult>;
}

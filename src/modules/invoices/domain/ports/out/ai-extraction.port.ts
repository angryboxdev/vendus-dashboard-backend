import type { AiExtractionResult } from "../../entities/ai-extraction-result.js";

export interface AiExtractionPort {
  extract(fileBuffer: Buffer, mimeType: string): Promise<AiExtractionResult>;
}

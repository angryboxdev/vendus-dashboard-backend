import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { LineClassification, LineToClassify } from "../../services/classification/line-classifier.js";

export interface ClassifyInvoiceLinesResult {
  classifications: LineClassification[];
  metrics: { lines: number; deterministic: number; aiRequested: number; aiResolved: number; aiError: boolean };
}

/** Sugere a subcategoria de cada linha real (regras/histórico primeiro, IA só no que sobra). */
export interface ClassifyInvoiceLinesPort {
  execute(organizationId: OrganizationId, input: { supplierId: string | null; lines: LineToClassify[] }): Promise<ClassifyInvoiceLinesResult>;
}

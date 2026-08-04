import type {
  VendusGatewayPort,
  ListDocumentsParams,
  SelfConsumptionListParams,
  SelfConsumptionPage,
  RawSelfConsumptionRecord,
  RawSelfConsumptionProduct,
  VendusRegisterMovement,
} from "../../domain/ports/out/vendus-gateway.port.js";
import type { VendusDocument, VendusDetailedDocumentRaw } from "../../domain/entities/vendus-document.js";
import { vendusGet, vendusGetBasic } from "../../../../infra/vendusClient.js";

export class VendusHttpGateway implements VendusGatewayPort {
  async listDocuments(params: ListDocumentsParams): Promise<VendusDocument[]> {
    const { since, until, type = "FS,FT,NC", per_page = 500 } = params;
    const all: VendusDocument[] = [];
    let page = 1;

    while (true) {
      let payload: unknown;
      try {
        payload = await vendusGet(`/documents/`, { since, until, type, per_page, page });
      } catch (e: unknown) {
        // Vendus returns 404 A001 "No data" when no documents exist in the period
        if (e instanceof Error && e.message.includes("A001")) break;
        throw e;
      }

      const items = extractItems(payload);
      all.push(...(items as VendusDocument[]));

      if (items.length < per_page) break;
      page++;
      if (page > 500) {
        console.warn("[VendusHttpGateway] listDocuments: reached 500-page fail-safe");
        break;
      }
    }

    return all;
  }

  async fetchDetail(id: number): Promise<VendusDetailedDocumentRaw> {
    return vendusGet<VendusDetailedDocumentRaw>(`/documents/${id}/`);
  }

  async listSelfConsumption(params: SelfConsumptionListParams): Promise<SelfConsumptionPage> {
    const query: Record<string, string | number> = {
      date_start: params.date_start,
      date_end: params.date_end,
    };
    if (params.page != null) query["page"] = params.page;

    let data: unknown;
    try {
      data = await vendusGetBasic(`/selfconsumption/`, query);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("A001")) {
        return { records: [], pagesCount: 1 };
      }
      throw e;
    }

    const d = (data && typeof data === "object") ? data as Record<string, unknown> : {};
    const records = Array.isArray(d["records"]) ? d["records"] as RawSelfConsumptionRecord[] : [];
    const pagesCount = Math.max(1, Number(d["pagesCount"]) || 1);
    return { records, pagesCount };
  }

  async fetchSelfConsumptionDetail(id: string | number): Promise<RawSelfConsumptionProduct[]> {
    const data = await vendusGetBasic<unknown>(`/selfconsumption/${id}/`);
    return extractSelfConsumptionProducts(data);
  }

  async listRegisterMovements(registerId: string, date: string): Promise<VendusRegisterMovement[]> {
    type MovementsResponse = VendusRegisterMovement[] | { errors?: unknown };
    const response = await vendusGetBasic<MovementsResponse>(
      `/v1.1/registers/${registerId}/movements/`,
      { since: date, until: date, per_page: 500 },
    );
    if (Array.isArray(response)) return response;
    return [];
  }
}

function extractSelfConsumptionProducts(data: unknown): RawSelfConsumptionProduct[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;

  if (Array.isArray(d["products"]) && d["products"].length > 0) {
    return d["products"] as RawSelfConsumptionProduct[];
  }
  const sc = d["selfconsumption"];
  if (sc && typeof sc === "object" && !Array.isArray(sc)) {
    const p = (sc as Record<string, unknown>)["products"];
    if (Array.isArray(p) && p.length > 0) return p as RawSelfConsumptionProduct[];
  }
  if (Array.isArray(sc)) {
    for (const item of sc) {
      if (item && typeof item === "object") {
        const p = (item as Record<string, unknown>)["products"];
        if (Array.isArray(p) && p.length > 0) return p as RawSelfConsumptionProduct[];
      }
    }
  }
  return [];
}

function extractItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (Array.isArray(p["data"])) return p["data"] as unknown[];
    if (Array.isArray(p["documents"])) return p["documents"] as unknown[];
  }
  return [];
}

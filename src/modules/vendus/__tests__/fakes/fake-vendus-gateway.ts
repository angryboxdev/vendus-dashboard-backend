import type {
  VendusGatewayPort,
  ListDocumentsParams,
  SelfConsumptionListParams,
  SelfConsumptionPage,
  RawSelfConsumptionRecord,
  RawSelfConsumptionProduct,
} from "../../domain/ports/out/vendus-gateway.port.js";
import type { VendusDocument, VendusDetailedDocumentRaw } from "../../domain/entities/vendus-document.js";

export class FakeVendusGateway implements VendusGatewayPort {
  private documents: VendusDocument[] = [];
  private detailMap = new Map<number, VendusDetailedDocumentRaw>();
  private selfConsumptionRecords: RawSelfConsumptionRecord[] = [];
  private selfConsumptionDetailMap = new Map<string | number, RawSelfConsumptionProduct[]>();

  setDocuments(docs: VendusDocument[]): void {
    this.documents = docs;
  }

  setDetail(id: number, doc: VendusDetailedDocumentRaw): void {
    this.detailMap.set(id, doc);
  }

  setSelfConsumptionRecords(records: RawSelfConsumptionRecord[]): void {
    this.selfConsumptionRecords = records;
  }

  setSelfConsumptionDetail(id: string | number, products: RawSelfConsumptionProduct[]): void {
    this.selfConsumptionDetailMap.set(id, products);
  }

  async listDocuments(_params: ListDocumentsParams): Promise<VendusDocument[]> {
    return [...this.documents];
  }

  async fetchDetail(id: number): Promise<VendusDetailedDocumentRaw> {
    const doc = this.detailMap.get(id);
    if (!doc) throw new Error(`FakeVendusGateway: no detail for id ${id}`);
    return { ...doc };
  }

  async listSelfConsumption(_params: SelfConsumptionListParams): Promise<SelfConsumptionPage> {
    return { records: [...this.selfConsumptionRecords], pagesCount: 1 };
  }

  async fetchSelfConsumptionDetail(id: string | number): Promise<RawSelfConsumptionProduct[]> {
    return this.selfConsumptionDetailMap.get(id) ?? [];
  }
}

import type {
  VendusGatewayPort,
  ListDocumentsParams,
  SelfConsumptionListParams,
  SelfConsumptionPage,
  RawSelfConsumptionProduct,
  VendusRegisterMovement,
} from "../../domain/ports/out/vendus-gateway.port.js";
import type { VendusDocument, VendusDetailedDocumentRaw } from "../../domain/entities/vendus-document.js";

/** Documentos guardados no máximo (≈ 10 meses de um restaurante; alguns KB cada). */
const DEFAULT_MAX_ENTRIES = 10_000;

/**
 * Guarda em memória o detalhe dos documentos (`fetchDetail`). Um documento fiscal emitido (FS/FT/NC)
 * não muda — a anulação é outro documento (NC) —, por isso pode ficar guardado sem prazo. Sem isto, o
 * resumo de um mês pede ~900 detalhes à Vendus (≈ 70 s) em cada abertura do Mapa e da conferência.
 * O resto (listas, autoconsumo, movimentos de caixa) passa sempre à Vendus. Ao chegar ao limite sai o
 * mais antigo. A cache vive no processo: um reinício (deploy) começa vazio.
 */
export class CachingVendusGateway implements VendusGatewayPort {
  private readonly details = new Map<number, VendusDetailedDocumentRaw>();
  private readonly inFlight = new Map<number, Promise<VendusDetailedDocumentRaw>>();

  constructor(
    private readonly inner: VendusGatewayPort,
    private readonly maxEntries = DEFAULT_MAX_ENTRIES,
  ) {}

  listDocuments(params: ListDocumentsParams): Promise<VendusDocument[]> {
    return this.inner.listDocuments(params);
  }

  async fetchDetail(id: number): Promise<VendusDetailedDocumentRaw> {
    const cached = this.details.get(id);
    if (cached) return cached;
    // Dois pedidos ao mesmo tempo (Mapa e conferência) partilham a mesma ida à Vendus.
    const pending = this.inFlight.get(id);
    if (pending) return pending;
    const request = this.inner
      .fetchDetail(id)
      .then((doc) => {
        this.details.set(id, doc);
        if (this.details.size > this.maxEntries) this.details.delete(this.details.keys().next().value!);
        return doc;
      })
      .finally(() => this.inFlight.delete(id));
    this.inFlight.set(id, request);
    return request;
  }

  listSelfConsumption(params: SelfConsumptionListParams): Promise<SelfConsumptionPage> {
    return this.inner.listSelfConsumption(params);
  }

  fetchSelfConsumptionDetail(id: string | number): Promise<RawSelfConsumptionProduct[]> {
    return this.inner.fetchSelfConsumptionDetail(id);
  }

  listRegisterMovements(registerId: string, date: string): Promise<VendusRegisterMovement[]> {
    return this.inner.listRegisterMovements(registerId, date);
  }
}

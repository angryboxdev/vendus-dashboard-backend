import type { ListDocumentsPort, ListDocumentsParams, ListDocumentsResult } from "../../domain/ports/in/list-documents.port.js";
import type { VendusGatewayPort } from "../../domain/ports/out/vendus-gateway.port.js";

export class ListDocumentsUseCase implements ListDocumentsPort {
  constructor(private readonly gateway: VendusGatewayPort) {}

  async execute(params: ListDocumentsParams): Promise<ListDocumentsResult> {
    const documents = await this.gateway.listDocuments({
      since: params.since,
      until: params.until,
      ...(params.type !== undefined && { type: params.type }),
      ...(params.per_page !== undefined && { per_page: params.per_page }),
    });
    return { documents, pagesFetched: 1 };
  }
}

import type { AtCredentials } from "../../entities/at-communication.js";

/** Serviço da AT: séries (SeriesWS) ou comunicação de documentos (e-Fatura). */
export type AtService = "series" | "efatura";

/**
 * Envia um corpo SOAP à AT com ligação mTLS (certificado do produtor) e o
 * cabeçalho WS-Security com a senha cifrada. Devolve o XML da resposta
 * (incluindo SOAP Faults); falha de rede → `AtTransportError`.
 */
export interface AtGatewayPort {
  send(service: AtService, body: string, credentials: AtCredentials): Promise<string>;
}

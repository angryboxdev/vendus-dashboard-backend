/**
 * Cópias do emitente e do cliente gravadas no documento, tal como estavam na
 * emissão (2.ª via com os dados originais — Despacho 8632/2014, 2.2.15).
 */
export interface PartyAddress {
  street: string;
  postalCode: string;
  city: string;
  /** ISO 3166-1 alpha-2, ex.: "PT". */
  country: string;
}

export interface IssuerSnapshot {
  taxId: string;
  name: string;
  address: PartyAddress;
}

/** Consumidor final sem NIF: `taxId` 999999990, nome «Consumidor final» (Despacho 2.2.5). */
export interface CustomerSnapshot {
  /** SAF-T CustomerID. */
  customerId: string;
  taxId: string;
  name: string;
  country: string;
  address: PartyAddress | null;
}

export const FINAL_CONSUMER: CustomerSnapshot = {
  customerId: "Consumidor final",
  taxId: "999999990",
  name: "Consumidor final",
  country: "PT",
  address: null,
};

/** Documento referido por uma NC/ND (References) ou por uma fatura de consulta de mesa (OrderReferences). */
export interface DocumentReference {
  documentId: string;
  documentNumber: string;
  reason?: string;
}

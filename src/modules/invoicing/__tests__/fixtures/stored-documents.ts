import { dec } from "../../../../kernel/money/decimal.js";
import type { StoredDocument } from "../../domain/ports/out/invoicing-store.port.js";

/** Documentos gravados fictícios (dados de teste — nenhum cliente real). */
export const H = (c: string) => c.repeat(171) + "=";
export const STORED_ISSUER = { taxId: "599999999", name: "Empresa Fictícia, Lda", address: { street: "Rua A, 1", postalCode: "4000-001", city: "Porto", country: "PT" } };
export const FINAL_CONSUMER = { customerId: "Consumidor final", taxId: "999999990", name: "Consumidor final", country: "PT", address: null };

export function storedDoc(over: Partial<StoredDocument> = {}): StoredDocument {
  return {
    id: "d",
    legalEntityId: "le-1",
    documentType: "FS",
    seriesMode: "training",
    customerTaxId: "999999990",
    documentNumber: "FS L01-2027/1",
    documentDate: "2027-03-10",
    status: "N",
    grossTotal: dec("28.10"),
    seriesRef: "s",
    sequence: 1,
    taxPointDate: "2027-03-10",
    systemEntryDate: "2027-03-10T12:00:00",
    systemEntryAt: "2027-03-10T12:00:00.000Z",
    softwareCertificateNumber: "0",
    hash: H("a"),
    hashControl: "0",
    atcud: "CDF7T5HD-1",
    qrPayload: "q",
    pricesIncludeTax: true,
    netTotal: "24.66",
    taxPayable: "3.44",
    paymentMechanism: null,
    customer: FINAL_CONSUMER,
    issuer: STORED_ISSUER,
    referencesTo: [],
    orderReferences: [],
    statusReason: null,
    statusChangedAt: null,
    statusChangedBy: null,
    statusEntryDate: null,
    createdBy: "u1",
    lines: [],
    taxes: [
      { taxRegion: "PT", taxCode: "INT", taxPercentage: "13", exemptionCode: null, exemptionReason: null, taxableBase: "22.12", taxAmount: "2.88" },
      { taxRegion: "PT", taxCode: "NOR", taxPercentage: "23", exemptionCode: null, exemptionReason: null, taxableBase: "2.44", taxAmount: "0.56" },
      { taxRegion: "PT", taxCode: "ISE", taxPercentage: "0", exemptionCode: "M99", exemptionReason: "Não sujeito ou não tributado", taxableBase: "0.10", taxAmount: "0.00" },
    ],
    ...over,
  };
}

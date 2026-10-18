/**
 * Identidade fiscal de um documento de compra (fatura / nota de crédito),
 * partilhada pelo Financeiro e pelo Stock (task v1.2 §1.2). Um documento
 * real tem UMA identidade, venha de que módulo vier.
 *
 * Chave forte: organização + entidade compradora + país/NIF do emitente +
 * tipo + série/número fiscal completo. O texto original é preservado; a
 * normalização serve só para comparar (nunca converte números em inteiros).
 */

export type FiscalDocumentType = "invoice" | "credit_note";
export type FiscalOrigin = "finance" | "stock";

/** O que se sabe do documento (pode estar incompleto). */
export interface FiscalIdentityInput {
  /** Entidade compradora; null = a organização (sem entidade legal escolhida). */
  buyerLegalEntityId: string | null;
  issuerTaxId: string | null;
  /** País do emitente (ISO-2), se o documento o indicar. */
  issuerCountry: string | null;
  documentType: FiscalDocumentType;
  seriesNumber: string | null;
  atcud: string | null;
}

export interface FiscalKey {
  buyerKey: string;
  issuerCountry: string;
  issuerTaxId: string;
  documentType: FiscalDocumentType;
  seriesNumberNorm: string;
}

export interface FiscalIdentity extends FiscalKey {
  id: string;
  legalEntityId: string | null;
  /** Série/número tal como no primeiro documento visto. */
  seriesNumber: string;
  /** Só dígitos (para assinalar POSSÍVEIS duplicados — nunca para fundir). */
  numberDigits: string;
  atcud: string | null;
  firstOrigin: FiscalOrigin;
  invoiceId: string | null;
  stockImportId: string | null;
  createdAt: string;
}

/** `issuer_tax_id_invalid`: NIF português com dígito de controlo errado (ex.: dígitos trocados na leitura). */
export type MissingField = "issuer_tax_id" | "issuer_tax_id_invalid" | "issuer_country" | "series_number";

export type IdentityResolution =
  | { kind: "incomplete"; missing: MissingField[] }
  /** Nenhum documento com esta identidade. */
  | { kind: "new"; key: FiscalKey }
  /** Já existe no Financeiro (fatura). */
  | { kind: "existing_finance"; identity: FiscalIdentity }
  /** Já existe só no Stock (importação do Stock, ainda sem lançamento financeiro). */
  | { kind: "existing_stock_only"; identity: FiscalIdentity }
  /** Mesmo emitente e mesmos dígitos com série/formatação diferente: comparar à mão. */
  | { kind: "possible_duplicate"; key: FiscalKey; candidates: FiscalIdentity[] };

/** Resultado de reservar a identidade para um documento. */
export type ClaimResult = { ok: true; identity: FiscalIdentity; linkedToStock: boolean } | { ok: false; resolution: Exclude<IdentityResolution, { kind: "new" }> };

export interface ClaimOptions {
  /** A pessoa comparou e confirmou que NÃO é o mesmo documento que os candidatos parecidos. */
  notADuplicate?: boolean;
  /** Completar a identidade que já existe só no Stock (em vez de recusar). */
  completeStockIdentityId?: string;
}

/** Documento histórico (para a migração com simulação). */
export interface HistoricalDocument {
  origin: FiscalOrigin;
  /** id da fatura (finance) ou da importação (stock). */
  id: string;
  input: FiscalIdentityInput;
  createdAt: string;
  label: string;
}

export interface BackfillReport {
  dryRun: boolean;
  scanned: number;
  registered: number;
  /** Já tinham identidade (backfill repetido é idempotente). */
  alreadyRegistered: number;
  incomplete: { origin: FiscalOrigin; id: string; label: string; missing: string[] }[];
  /** Mesma identidade em mais de um documento — rever à mão (não se funde nem apaga nada). */
  duplicates: { key: string; documents: { origin: FiscalOrigin; id: string; label: string }[] }[];
}


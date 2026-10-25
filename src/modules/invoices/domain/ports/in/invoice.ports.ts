import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { LineReadingMeta } from "../../entities/ai-extraction-result.js";
import type {
  InvoiceStatus,
  InvoiceLineType,
  InvoiceSource,
  InvoiceDocumentType,
  AiExtractionStatus,
  ReconciliationStatus,
  LineDetailMode,
  StockReviewOverride,
} from "../../entities/invoice.js";

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface InvoiceLineDTO {
  id: string;
  invoiceId: string;
  description: string;
  type: InvoiceLineType;
  costCenterCategoryId: string | null;
  stockItemId: string | null;
  quantity: number;
  unit: string | null;
  unitCostWithoutVat: number;
  vatRate: number;
  vatAmount: number;
  totalWithVat: number;
  stockEntryId: string | null;
  affectsDre: boolean;
  affectsCashflow: boolean;
  affectsProfitability: boolean;
  financialType: string | null;
  channelId: string | null;
  requiresChannel: boolean;
  requiresAllocation: boolean;
  /** Loja a que este custo é alocado; null quando o custo é da organização inteira (D3/D4). */
  locationId: string | null;
  /** Valor para DRE/Rentabilidade: totalWithVat − vatAmount (sem IVA) */
  dreValue: number;
  /** Valor para Fluxo de Caixa: totalWithVat (com IVA) */
  cashflowValue: number;
  createdAt: string;
  /** Módulo Contabilidade — override de dedutibilidade de IVA (`null` = usa a sugestão da subcategoria). */
  deductiblePercentage: number | null;
  deductibilityOverrideReason: string | null;
}

export interface InvoiceDTO {
  id: string;
  supplierId: string | null;
  supplierName: string;
  supplierNifSnapshot: string | null;
  invoiceNumber: string;
  invoiceDate: string;    // YYYY-MM-DD
  dueDate: string | null;
  paidAt: string | null;
  isDirectDebit: boolean;
  directDebitDate: string | null; // YYYY-MM-DD
  subtotalWithoutVat: number;
  totalVat: number;
  totalWithVat: number;
  documentType: InvoiceDocumentType;
  status: InvoiceStatus;
  reconciliationStatus: ReconciliationStatus;
  lineDetailMode: LineDetailMode;
  /** F2 §2.2: «Única» | «Por artigo» | «Por valores» (derivado de lineDetailMode). */
  financialMode: FinancialModeName;
  /** Modo «Por valores»: repartições financeiras (não são artigos). */
  allocations?: InvoiceAllocationDTO[];
  /** Valores gravados (detalhe): descontos, textos originais, ajustes — reabrir rascunho sem perder nada. */
  storedAmounts?: import("../out/invoice-amounts-write.port.js").StoredAmountsView | null;
  paymentBankAccountId: string | null;
  paymentMethod: string | null;
  paymentNotes: string | null;
  competenceDate: string | null; // YYYY-MM-DD
  notes: string | null;
  attachmentUrl: string | null;
  source: InvoiceSource;
  aiExtractionStatus: AiExtractionStatus | null;
  aiConfidence: number | null;
  requiresReview: boolean;
  /** true quando outra fatura activa (não cancelada) do mesmo fornecedor tem o mesmo número. Calculado em cada listagem — ver findDuplicateInvoiceIds. */
  isDuplicate: boolean;
  costCenterGroupId: string | null;
  costCenterCategoryId: string | null;
  financialType: string | null;
  affectsDre: boolean;
  affectsCashflow: boolean;
  affectsProfitability: boolean;
  currency: string;
  /** Módulo Stock (Compra por rever) — `null` = automático (categoria/fornecedor decidem, nunca o Centro de Custo). */
  stockReviewOverride: StockReviewOverride;
  stockReviewOverrideReason: string | null;
  /** E3b-2: obrigação (Finanças/Segurança Social) — null = fatura de compra. */
  obligation: { kind: "tax_obligation" | "contribution_obligation"; paymentReference: string | null; mbEntity: string | null; period: string | null } | null;
  /** F3c: `stock` = importada no Stock; enquanto rascunho, «Aguardando lançamento no Financeiro». */
  importOrigin: "stock" | null;
  createdAt: string;
  updatedAt: string;
  /** Versão atual — enviar como `expectedVersion` ao editar/confirmar (409 `version_conflict` se mudou). */
  version: number;
  lines?: InvoiceLineDTO[];
  /** Presente apenas quando lineDetailMode === "detailed" e as linhas foram carregadas. */
  linesSummary?: {
    subtotalWithoutVat: number;
    totalVat: number;
    totalWithVat: number;
    /** true quando qualquer dos três totais difere dos totais da fatura em mais de 1 cêntimo. */
    totalsMismatch: boolean;
  };
  /**
   * Resumo de classificação derivado das linhas reais.
   * - "unique": todas as linhas têm a mesma subcategoria.
   * - "mixed": linhas com subcategorias diferentes.
   * - "none": nenhuma linha está classificada.
   */
  classificationSummary: {
    mode: "unique" | "mixed" | "none";
    /** "net" = montantes líquidos sem IVA (modo «Por valores»); omitido = com IVA. */
    basis?: "net";
    entries: Array<{
      costCenterCategoryId: string;
      code: string;
      name: string;
      financialType: string | null;
      /** Soma de totalWithVat das linhas com esta subcategoria (em cêntimos). */
      totalWithVat: number;
    }>;
  };
}

export interface SupplierMatchDTO {
  id: string;
  name: string;
  nif: string | null;
  defaultCostCenterGroupId: string | null;
  defaultCostCenterCategoryId: string | null;
  defaultFinancialType: string | null;
}

export interface AiExtractedLineDTO {
  description: string;
  quantity: number | null;
  unitPriceWithoutVat: number | null;
  vatRate: number | null;
  vatAmount: number | null;
  totalWithoutVat: number | null;
  totalWithVat: number | null;
  /** Texto tal como impresso (ex.: "20.000", "1,235") — o motor resolve a leitura que reconcilia. */
  quantityText?: string | null;
  unitPriceText?: string | null;
  /** Bruto da linha antes de descontos (cêntimos), quando impresso. */
  grossWithoutDiscount?: number | null;
  /** Desconto comercial da linha: % (10 = 10%) ou valor em cêntimos. */
  discountPct?: number | null;
  discountAmount?: number | null;
  /** Leitor determinístico (E3): código do artigo, página, tipo, IVA do fornecedor, promoção, depósito→artigo. */
  meta?: LineReadingMeta;
  /** Categoria sugerida para a linha (subcategoria do catálogo da organização) — sugestão, nunca aplicada sem revisão. */
  suggestedCostCenterCategoryId?: string | null;
  classificationSource?: "line_kind" | "history_code" | "history_description" | "keyword" | "ai" | "none";
  classificationEvidence?: string;
  /** Histórico em conflito: decisão humana. */
  classificationConflict?: boolean;
}

/** Como foi lido o documento importado (E3). */
export interface ImportReadingDTO {
  source: "deterministic" | "ai";
  layout: string | null;
  qrRead: boolean;
  status: "ready" | "needs_attention" | "unsupported";
  issues: { code: string; blocking: boolean; detail: string }[];
  aiCalls: number;
  ms: number;
}

export interface InvoiceImportResultDTO {
  invoice: InvoiceDTO;
  aiConfidence: number;
  validationIssues: string[];
  supplierMatch: SupplierMatchDTO | null;
  extractedLines: AiExtractedLineDTO[];
  /** Descontos globais/rodapé e quadro de IVA extraídos (para o editor de valores). */
  extractedAmounts?: { globalDiscountPct: number | null; globalDiscountAmount: number | null; footerDiscountAmount: number | null; vatSummary: { rate: number; baseCents: number; vatCents: number }[] | null };
  /** O documento já existia (mesmo ficheiro ou mesma identidade fiscal): é devolvido o existente, sem criar cópia. */
  reused?: "same_file" | "same_fiscal_identity";
  /** Identidade fiscal do documento extraído (avisos na revisão). */
  fiscal?: { kind: string; existingInvoiceId?: string | null; identityId?: string; candidates?: { invoiceId: string | null; seriesNumber: string }[]; missing?: string[] };
  /** Leitor usado (QR + texto do PDF, ou IA) e problemas encontrados (E3). */
  reading?: ImportReadingDTO;
  /** E3b: logótipo encontrado na fatura para um fornecedor ainda sem logótipo — só é usado se a pessoa confirmar. */
  logoSuggestion?: { url: string; width: number; height: number };
}

export interface InvoiceAlertsDTO {
  overdue: { count: number; totalAmount: number };
  dueToday: { count: number; totalAmount: number };
  dueIn7Days: { count: number; totalAmount: number };
  pendingReconciliation: { count: number; totalAmount: number };
  noDueDateCount: number;
  noSupplierCount: number;
  pendingReviewCount: number;
  lowAiConfidenceCount: number;
  valueDiscrepancyCount: number;
}

// ── Commands ──────────────────────────────────────────────────────────────────

export interface CreateInvoiceLineCommand {
  description: string;
  type?: InvoiceLineType;
  costCenterCategoryId?: string | null;
  stockItemId?: string | null;
  quantity: number;
  unit?: string | null;
  unitCostWithoutVat: number;
  vatRate: number;
  vatAmount: number;
  totalWithVat: number;
  affectsDre?: boolean;
  affectsCashflow?: boolean;
  affectsProfitability?: boolean;
  /** Loja a que este custo é alocado (spec B2 D4) — opcional; ausente/null = custo da organização. */
  locationId?: string | null;
  /** Texto original da quantidade/preço no documento (ex.: "20.000", "1,235") — o servidor recalcula com ele. */
  quantityText?: string | null;
  unitPriceText?: string | null;
  /** Bruto impresso na linha (cêntimos), para resolver quantidades ambíguas. */
  grossCentsPrinted?: number | null;
  /** Desconto comercial da linha: % (value = 10 → 10%) ou € (value em cêntimos). */
  discount?: AmountDiscountCommand | null;
  /** Metadados do leitor determinístico (E3), guardados com a linha. */
  reading?: LineReadingMeta | null;
}

export type FinancialModeName = "single" | "by_item" | "by_values";

/** Repartição «Por valores»: descrição + subcategoria (+ loja) + montante líquido em cêntimos. */
export interface AllocationCommand {
  description: string;
  costCenterGroupId?: string | null;
  costCenterCategoryId: string;
  locationId?: string | null;
  netCents: number;
}

export interface InvoiceAllocationDTO {
  id: string;
  invoiceId: string;
  position: number;
  description: string;
  costCenterGroupId: string | null;
  costCenterCategoryId: string;
  locationId: string | null;
  netCents: number;
}

export interface AmountDiscountCommand {
  kind: "pct" | "amount";
  value: number;
}

/** Valores do documento (task v1.2 §1.3) — o servidor recalcula tudo com o motor único ao finalizar. */
export interface DocumentAmountsCommand {
  globalDiscount?: AmountDiscountCommand | null;
  /** Desconto impresso no rodapé (cêntimos): pode ser só o resumo dos descontos das linhas. */
  footerDiscountCents?: number | null;
  /** Ajustes documentados (portes, ecovalor…) em cêntimos. */
  adjustmentsCents?: number;
  /** Quadro de IVA por taxa tal como no documento. */
  vatSummary?: { rate: number; baseCents: number; vatCents: number }[] | null;
  /** Ajuste de arredondamento: no máximo 1 cêntimo por taxa de IVA e com motivo. */
  roundingAdjustment?: { cents: number; reason: string } | null;
}

export interface CreateInvoiceCommand {
  organizationId: OrganizationId;
  supplierId?: string | null;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  dueDate?: string | null;
  isDirectDebit?: boolean;
  directDebitDate?: string | null; // YYYY-MM-DD
  subtotalWithoutVat: number;
  totalVat: number;
  totalWithVat: number;
  documentType?: InvoiceDocumentType;
  notes?: string | null;
  attachmentUrl?: string | null;
  costCenterGroupId?: string | null;
  costCenterCategoryId?: string | null;
  financialType?: string | null;
  affectsDre?: boolean;
  affectsCashflow?: boolean;
  affectsProfitability?: boolean;
  currency?: string;
  stockReviewOverride?: StockReviewOverride;
  stockReviewOverrideReason?: string | null;
  lines?: CreateInvoiceLineCommand[];
  /** Quem faz o pedido (definido pelo servidor a partir da sessão). */
  actor?: string;
  /** A pessoa comparou com os documentos parecidos e confirmou que é outro documento. */
  notADuplicate?: boolean;
  /** Completar o documento que já existe só no Stock (identidade fiscal indicada). */
  completeStockIdentityId?: string;
  amounts?: DocumentAmountsCommand;
  /** F2 §2.2: modo financeiro; omitido = «Por artigo» se houver linhas, senão «Única». */
  financialMode?: FinancialModeName;
  /** Obrigatório em «Por valores»: soma = base líquida. */
  allocations?: AllocationCommand[];
}

export interface UpdateInvoiceCommand {
  organizationId: OrganizationId;
  id: string;
  /** Bloqueio otimista: versão que o cliente leu. */
  expectedVersion?: number;
  /** Motivo da alteração (fica na auditoria). */
  reason?: string;
  supplierId?: string | null;
  supplierName?: string;
  supplierNifSnapshot?: string | null;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string | null;
  isDirectDebit?: boolean;
  directDebitDate?: string | null; // YYYY-MM-DD
  subtotalWithoutVat?: number;
  totalVat?: number;
  totalWithVat?: number;
  documentType?: InvoiceDocumentType;
  notes?: string | null;
  attachmentUrl?: string | null;
  costCenterGroupId?: string | null;
  costCenterCategoryId?: string | null;
  financialType?: string | null;
  affectsDre?: boolean;
  affectsCashflow?: boolean;
  affectsProfitability?: boolean;
  currency?: string;
  stockReviewOverride?: StockReviewOverride;
  stockReviewOverrideReason?: string | null;
  /** Identifica quem faz o pedido (email autenticado) — usado só se for preciso apagar um rascunho de revisão de stock (auditoria, ver `shared-stock-review-guard`). Opcional para não quebrar chamadores/testes existentes; o controller HTTP envia sempre `req.auth.email`. */
  actor?: string;
  /**
   * Só relevante quando `stockReviewOverride` muda e existe uma revisão de
   * stock associada ainda não aplicada (D10, módulo `stock-purchase-review`)
   * — `true` confirma que o utilizador aceita remover essa revisão para
   * prosseguir. Omitido/`false` faz o pedido falhar com 409 (confirmação
   * necessária) em vez de descartar a revisão silenciosamente.
   */
  confirmRemoveStockReview?: boolean;
  /** A pessoa comparou com os documentos parecidos e confirmou que é outro documento. */
  notADuplicate?: boolean;
}

export interface MarkInvoicePaidCommand {
  organizationId: OrganizationId;
  id: string;
  paidAt?: string; // YYYY-MM-DD — defaults to today
  bankAccountId?: string | null;
  paymentMethod?: string | null;
  paymentNotes?: string | null;
}

export interface SetLineDetailModeCommand {
  organizationId: OrganizationId;
  id: string;
  mode: LineDetailMode;
  /** Identifica quem faz o pedido (email autenticado) — usado só se for preciso apagar um rascunho de revisão de stock (auditoria, ver `shared-stock-review-guard`). */
  actor?: string;
  /** Ver `UpdateInvoiceCommand.confirmRemoveStockReview` — mesma semântica, para a transição `detailed → simple` que descartaria linhas com uma revisão de stock associada ainda não aplicada. */
  confirmRemoveStockReview?: boolean;
}

export interface SetInvoiceStatusCommand {
  organizationId: OrganizationId;
  id: string;
  status: InvoiceStatus;
}

export interface ClassifyInvoiceLineCommand {
  organizationId: OrganizationId;
  invoiceId: string;
  lineId: string;
  classify: {
    type?: InvoiceLineType;
    costCenterCategoryId?: string | null;
    stockItemId?: string | null;
    channelId?: string | null;
  };
  saveAsRule?: boolean;
}

export interface ListInvoicesFilter {
  supplierId?: string;
  costCenterId?: string;
  status?: InvoiceStatus;
  reconciliationStatus?: ReconciliationStatus;
  from?: string; // YYYY-MM-DD
  to?: string;
  isDirectDebit?: boolean;
  documentType?: InvoiceDocumentType;
  search?: string; // free-text: supplier name or invoice number
}

export interface SuggestClassificationResult {
  costCenterId: string | null;
  costCenterCategoryId: string | null;
  lineType: InvoiceLineType | null;
  category: string | null;
  channelId: string | null;
  confidenceScore: number; // 0.0 – 1.0
}

export interface ImportInvoiceCommand {
  organizationId: OrganizationId;
  fileBuffer: Buffer;
  filename: string;
  mimeType: string;
  /** Escolha explícita do utilizador antes do upload — tem prioridade sobre a deteção automática da IA. */
  documentType?: InvoiceDocumentType;
}

export interface NewSupplierCommand {
  name: string;
  nif?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  iban?: string | null;
  defaultCostCenterGroupId?: string | null;
  defaultCostCenterCategoryId?: string | null;
  paymentTermsDays?: number | null;
}

export interface ConfirmImportedInvoiceCommand {
  organizationId: OrganizationId;
  id: string;
  /** Bloqueio otimista: versão que o cliente leu. */
  expectedVersion?: number;
  supplierId?: string | null;
  /** Criar novo fornecedor com os dados da fatura — se presente, supplierId é ignorado */
  newSupplier?: NewSupplierCommand;
  supplierName?: string;
  supplierNifSnapshot?: string | null;
  invoiceNumber?: string;
  invoiceDate?: string; // YYYY-MM-DD
  dueDate?: string | null;
  isDirectDebit?: boolean;
  directDebitDate?: string | null; // YYYY-MM-DD
  subtotalWithoutVat?: number;
  totalVat?: number;
  totalWithVat?: number;
  documentType?: InvoiceDocumentType;
  notes?: string | null;
  costCenterGroupId?: string | null;
  costCenterCategoryId?: string | null;
  financialType?: string | null;
  affectsDre?: boolean;
  affectsCashflow?: boolean;
  affectsProfitability?: boolean;
  currency?: string;
  stockReviewOverride?: StockReviewOverride;
  stockReviewOverrideReason?: string | null;
  saveAsPayable?: boolean;
  markAsPaid?: boolean;
  paidAt?: string; // YYYY-MM-DD — used when markAsPaid is true; defaults to invoiceDate
  lines?: CreateInvoiceLineCommand[];
  /** Quem faz o pedido (definido pelo servidor a partir da sessão). */
  actor?: string;
  /** A pessoa comparou com os documentos parecidos e confirmou que é outro documento. */
  notADuplicate?: boolean;
  /** Completar o documento que já existe só no Stock (identidade fiscal indicada). */
  completeStockIdentityId?: string;
  /** F3c: a pessoa aceitou descartar a revisão de Stock por aplicar ao mudar as linhas. */
  confirmRemoveStockReview?: boolean;
  amounts?: DocumentAmountsCommand;
  /** F2 §2.2: modo financeiro; omitido = «Por artigo» se houver linhas, senão «Única». */
  financialMode?: FinancialModeName;
  /** Obrigatório em «Por valores»: soma = base líquida. */
  allocations?: AllocationCommand[];
}

export interface AddInvoiceLineCommand {
  organizationId: OrganizationId;
  invoiceId: string;
  description: string;
  type?: InvoiceLineType;
  costCenterCategoryId?: string | null;
  quantity: number;
  unit?: string | null;
  unitCostWithoutVat: number;
  vatRate: number;
  vatAmount: number;
  totalWithVat: number;
  affectsDre?: boolean;
  affectsCashflow?: boolean;
  affectsProfitability?: boolean;
  /** Loja a que este custo é alocado (spec B2 D4) — opcional; ausente/null = custo da organização. */
  locationId?: string | null;
  /** Fatura em Compras por rever por aplicar: confirma descartar essa revisão (ver `UpdateInvoiceCommand.confirmRemoveStockReview`). */
  confirmRemoveStockReview?: boolean;
  actor?: string;
}

/** Ver `AddInvoiceLineCommand.confirmRemoveStockReview` — mesma semântica ao apagar uma linha. */
export interface DeleteInvoiceLineOptions {
  confirmRemoveStockReview?: boolean;
  actor?: string;
}

// ── Input ports ───────────────────────────────────────────────────────────────

export interface CreateInvoicePort {
  execute(command: CreateInvoiceCommand): Promise<InvoiceDTO>;
}

export interface UpdateInvoicePort {
  execute(command: UpdateInvoiceCommand): Promise<InvoiceDTO>;
}

export interface MarkInvoicePaidPort {
  execute(command: MarkInvoicePaidCommand): Promise<InvoiceDTO>;
}

export interface SetInvoiceStatusPort {
  execute(command: SetInvoiceStatusCommand): Promise<InvoiceDTO>;
}

export interface AddInvoiceLinePort {
  execute(command: AddInvoiceLineCommand): Promise<InvoiceLineDTO>;
}

export interface ClassifyInvoiceLinePort {
  execute(command: ClassifyInvoiceLineCommand): Promise<InvoiceLineDTO>;
}

export interface ListInvoicesPort {
  execute(organizationId: OrganizationId, filter?: ListInvoicesFilter): Promise<InvoiceDTO[]>;
}

export interface ListInvoiceLinesPort {
  execute(organizationId: OrganizationId): Promise<InvoiceLineDTO[]>;
}

export interface GetInvoicePort {
  execute(organizationId: OrganizationId, id: string): Promise<InvoiceDTO>;
}

export interface DeleteInvoiceCommand {
  organizationId: OrganizationId;
  id: string;
  /** Motivo (fica na auditoria). */
  reason?: string;
  confirmRemoveStockReview?: boolean;
  actor?: string;
}

export interface DeleteInvoicePort {
  execute(command: DeleteInvoiceCommand): Promise<void>;
}

export interface SuggestLineClassificationPort {
  execute(
    organizationId: OrganizationId,
    supplierId: string,
    description?: string,
  ): Promise<SuggestClassificationResult | null>;
}

export interface ImportInvoicePort {
  execute(command: ImportInvoiceCommand): Promise<InvoiceImportResultDTO>;
}

export interface ConfirmImportedInvoicePort {
  execute(command: ConfirmImportedInvoiceCommand): Promise<InvoiceDTO>;
}

export interface GetInvoiceAlertsPort {
  execute(organizationId: OrganizationId): Promise<InvoiceAlertsDTO>;
}

export interface ProcessDirectDebitsPort {
  execute(organizationId: OrganizationId): Promise<{ processed: number }>;
}

export interface SetLineDetailModePort {
  execute(command: SetLineDetailModeCommand): Promise<InvoiceDTO>;
}

export interface UpdateInvoiceLineCommand {
  organizationId: OrganizationId;
  invoiceId: string;
  lineId: string;
  description?: string;
  quantity?: number;
  unit?: string | null;
  unitCostWithoutVat?: number;
  vatRate?: number;
  vatAmount?: number;
  totalWithVat?: number;
  /** Loja a que este custo é alocado (spec B2 D4) — opcional; ausente = não altera; null = desaloca. */
  locationId?: string | null;
}

export interface UpdateInvoiceLinePort {
  execute(command: UpdateInvoiceLineCommand): Promise<InvoiceLineDTO>;
}

export interface DeleteInvoiceLinePort {
  execute(organizationId: OrganizationId, invoiceId: string, lineId: string, options?: DeleteInvoiceLineOptions): Promise<void>;
}

export interface SetInvoiceLineDeductibilityOverrideCommand {
  organizationId: OrganizationId;
  invoiceId: string;
  lineId: string;
  /** `null` volta a usar a sugestão da subcategoria. */
  deductiblePercentage: number | null;
  deductibilityOverrideReason: string | null;
}

export interface SetInvoiceLineDeductibilityOverridePort {
  execute(command: SetInvoiceLineDeductibilityOverrideCommand): Promise<InvoiceLineDTO>;
}

// ── F3c: importar a fatura diretamente no Stock ───────────────────────────

export interface ImportInvoiceForStockCommand {
  organizationId: OrganizationId;
  fileBuffer: Buffer;
  filename: string;
  mimeType: string;
  /** A fatura já está lançada no Financeiro sem ir ao Stock: a pessoa escolheu encaminhá-la. */
  routeExisting?: boolean;
  actor: string;
}

export interface ImportInvoiceForStockResultDTO {
  /** `created` = rascunho novo (aguarda o Financeiro); `routed` = fatura já lançada enviada para o Stock. */
  kind: "created" | "routed";
  invoiceId: string;
  reviewId: string | null;
  validationIssues: string[];
  reading: ImportReadingDTO | null;
}

export interface ImportInvoiceForStockPort {
  execute(command: ImportInvoiceForStockCommand): Promise<ImportInvoiceForStockResultDTO>;
}

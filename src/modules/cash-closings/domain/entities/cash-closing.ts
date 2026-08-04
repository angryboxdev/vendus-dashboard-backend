import { CashClosingCalculator } from "../services/cash-closing-calculator.js";

export type CashClosingStatus = "pending" | "approved" | "rejected";

/**
 * Contagem física de notas e moedas na gaveta no fim do dia.
 * Chaves: notes<valor> para notas, coins<centimos> para moedas.
 */
export interface DrawerDenominations {
  notes50: number;
  notes20: number;
  notes10: number;
  notes5: number;
  coins200: number; // moeda de 2 €
  coins100: number; // moeda de 1 €
  coins50: number;  // moeda de 0,50 €
  coins20: number;  // moeda de 0,20 €
  coins10: number;  // moeda de 0,10 €
  coins1: number;   // moeda de 0,01 €
}

export interface CashClosingProps {
  id: string;
  closingDate: string;
  employeeId: string;
  employeeName: string;
  tpa: number;
  uber: number;
  glovo: number;
  bolt: number;
  eatz: number;
  cashSales: number;
  cashIn: number;
  cashOut: number;
  cashDrawerOpen: number;
  cashDrawerTotal: number;
  totalCalculated: number;
  vendusTotal: number | null;
  sangriaAmount: number;
  notes: string | null;
  status: CashClosingStatus;
  managerNotes: string | null;
  reviewedAt: string | null;
  submittedAt: string;
  /**
   * Datetime de abertura da sessão Vendus à qual este fecho pertence.
   * null em fechos legados (criados antes desta feature).
   */
  sessionOpenedAt: string | null;
  /**
   * Contagem física de notas e moedas na gaveta no fim do dia.
   * null em fechos criados antes desta feature.
   */
  drawerDenominations: DrawerDenominations | null;
  /**
   * Totais de referência AirMenu por plataforma de delivery externo.
   * Calculados automaticamente na submissão (best-effort); null se AirMenu indisponível
   * ou não configurado. Não fazem parte de totalCalculated — são apenas referência
   * para o manager comparar com os valores declarados pelo funcionário.
   * Imutáveis após submissão (não editáveis pelo manager).
   */
  airMenuUber: number | null;
  airMenuGlovo: number | null;
  airMenuBolt: number | null;
}

export interface ReviewPatch {
  status?: CashClosingStatus | undefined;
  managerNotes?: string | null | undefined;
  tpa?: number | undefined;
  uber?: number | undefined;
  glovo?: number | undefined;
  bolt?: number | undefined;
  eatz?: number | undefined;
  cashSales?: number | undefined;
  cashIn?: number | undefined;
  cashOut?: number | undefined;
  cashDrawerOpen?: number | undefined;
  cashDrawerTotal?: number | undefined;
  notes?: string | null | undefined;
}

export class CashClosing {
  readonly id: string;
  readonly closingDate: string;
  readonly employeeId: string;
  readonly employeeName: string;
  readonly tpa: number;
  readonly uber: number;
  readonly glovo: number;
  readonly bolt: number;
  readonly eatz: number;
  readonly cashSales: number;
  readonly cashIn: number;
  readonly cashOut: number;
  readonly cashDrawerOpen: number;
  readonly cashDrawerTotal: number;
  readonly totalCalculated: number;
  readonly vendusTotal: number | null;
  readonly sangriaAmount: number;
  readonly notes: string | null;
  readonly status: CashClosingStatus;
  readonly managerNotes: string | null;
  readonly reviewedAt: string | null;
  readonly submittedAt: string;
  readonly sessionOpenedAt: string | null;
  readonly drawerDenominations: DrawerDenominations | null;
  readonly airMenuUber: number | null;
  readonly airMenuGlovo: number | null;
  readonly airMenuBolt: number | null;
  /** Sub-total declarado para canais Vendus (TPA + Eatz + Dinheiro). Derivado. */
  readonly vendusCalculated: number;
  /** Sub-total declarado para canais AirMenu (Uber + Glovo + Bolt). Derivado. */
  readonly airMenuCalculated: number;

  private constructor(props: CashClosingProps) {
    this.id = props.id;
    this.closingDate = props.closingDate;
    this.employeeId = props.employeeId;
    this.employeeName = props.employeeName;
    this.tpa = props.tpa;
    this.uber = props.uber;
    this.glovo = props.glovo;
    this.bolt = props.bolt;
    this.eatz = props.eatz;
    this.cashSales = props.cashSales;
    this.cashIn = props.cashIn;
    this.cashOut = props.cashOut;
    this.cashDrawerOpen = props.cashDrawerOpen;
    this.cashDrawerTotal = props.cashDrawerTotal;
    this.totalCalculated = props.totalCalculated;
    this.vendusTotal = props.vendusTotal;
    this.sangriaAmount = props.sangriaAmount;
    this.notes = props.notes;
    this.status = props.status;
    this.managerNotes = props.managerNotes;
    this.reviewedAt = props.reviewedAt;
    this.submittedAt = props.submittedAt;
    this.sessionOpenedAt = props.sessionOpenedAt;
    this.drawerDenominations = props.drawerDenominations;
    this.airMenuUber = props.airMenuUber;
    this.airMenuGlovo = props.airMenuGlovo;
    this.airMenuBolt = props.airMenuBolt;
    this.vendusCalculated = CashClosingCalculator.computeVendusSubtotal({
      tpa: props.tpa,
      eatz: props.eatz,
      cashSales: props.cashSales,
    });
    this.airMenuCalculated = CashClosingCalculator.computeAirMenuSubtotal({
      uber: props.uber,
      glovo: props.glovo,
      bolt: props.bolt,
    });
  }

  /**
   * Factory para submissão de novo fecho.
   * Calcula automaticamente totalCalculated e sangriaAmount.
   */
  static create(params: {
    employeeId: string;
    employeeName: string;
    closingDate: string;
    tpa: number;
    uber: number;
    glovo: number;
    bolt: number;
    eatz: number;
    cashSales: number;
    cashIn: number;
    cashOut: number;
    cashDrawerOpen: number;
    cashDrawerTotal: number;
    vendusTotal: number | null;
    notes?: string | null | undefined;
    sessionOpenedAt?: string | null | undefined;
    drawerDenominations?: DrawerDenominations | null | undefined;
    airMenuUber?: number | null | undefined;
    airMenuGlovo?: number | null | undefined;
    airMenuBolt?: number | null | undefined;
  }): CashClosing {
    const totalCalculated = CashClosingCalculator.computeTotal({
      tpa: params.tpa,
      uber: params.uber,
      glovo: params.glovo,
      bolt: params.bolt,
      eatz: params.eatz,
      cashSales: params.cashSales,
    });
    const sangriaAmount = CashClosingCalculator.computeSangria(params.cashDrawerTotal);

    return new CashClosing({
      id: crypto.randomUUID(),
      closingDate: params.closingDate,
      employeeId: params.employeeId,
      employeeName: params.employeeName,
      tpa: params.tpa,
      uber: params.uber,
      glovo: params.glovo,
      bolt: params.bolt,
      eatz: params.eatz,
      cashSales: params.cashSales,
      cashIn: params.cashIn,
      cashOut: params.cashOut,
      cashDrawerOpen: params.cashDrawerOpen,
      cashDrawerTotal: params.cashDrawerTotal,
      totalCalculated,
      vendusTotal: params.vendusTotal,
      sangriaAmount,
      notes: params.notes ?? null,
      status: "pending",
      managerNotes: null,
      reviewedAt: null,
      submittedAt: new Date().toISOString(),
      sessionOpenedAt: params.sessionOpenedAt ?? null,
      drawerDenominations: params.drawerDenominations ?? null,
      airMenuUber: params.airMenuUber ?? null,
      airMenuGlovo: params.airMenuGlovo ?? null,
      airMenuBolt: params.airMenuBolt ?? null,
    });
  }

  /**
   * Factory para reconstituir a partir de dados persistidos.
   * Não revalida nem recalcula — confia que os dados do repositório estão corretos.
   */
  static reconstitute(props: CashClosingProps): CashClosing {
    return new CashClosing(props);
  }

  /**
   * Aplica um patch de revisão (manager).
   * Recomputa totalCalculated e sangriaAmount se algum campo numérico mudar.
   * Define reviewedAt se o status mudar.
   * Devolve uma nova instância — a entidade original não é mutada.
   * drawerDenominations não é alterado pela revisão (contagem física imutável).
   */
  review(patch: ReviewPatch): CashClosing {
    const tpa = patch.tpa ?? this.tpa;
    const uber = patch.uber ?? this.uber;
    const glovo = patch.glovo ?? this.glovo;
    const bolt = patch.bolt ?? this.bolt;
    const eatz = patch.eatz ?? this.eatz;
    const cashSales = patch.cashSales ?? this.cashSales;
    const cashIn = patch.cashIn ?? this.cashIn;
    const cashOut = patch.cashOut ?? this.cashOut;
    const cashDrawerOpen = patch.cashDrawerOpen ?? this.cashDrawerOpen;
    const cashDrawerTotal = patch.cashDrawerTotal ?? this.cashDrawerTotal;
    const notes = "notes" in patch ? (patch.notes ?? null) : this.notes;
    const managerNotes =
      "managerNotes" in patch ? (patch.managerNotes ?? null) : this.managerNotes;
    const status = patch.status ?? this.status;
    const reviewedAt = patch.status != null ? new Date().toISOString() : this.reviewedAt;

    const totalCalculated = CashClosingCalculator.computeTotal({
      tpa, uber, glovo, bolt, eatz, cashSales,
    });
    const sangriaAmount = CashClosingCalculator.computeSangria(cashDrawerTotal);

    return new CashClosing({
      id: this.id,
      closingDate: this.closingDate,
      employeeId: this.employeeId,
      employeeName: this.employeeName,
      tpa, uber, glovo, bolt, eatz, cashSales,
      cashIn, cashOut, cashDrawerOpen, cashDrawerTotal,
      totalCalculated,
      vendusTotal: this.vendusTotal,
      sangriaAmount,
      notes,
      status,
      managerNotes,
      reviewedAt,
      submittedAt: this.submittedAt,
      sessionOpenedAt: this.sessionOpenedAt,
      drawerDenominations: this.drawerDenominations,
      airMenuUber: this.airMenuUber,
      airMenuGlovo: this.airMenuGlovo,
      airMenuBolt: this.airMenuBolt,
    });
  }

  toProps(): CashClosingProps {
    return {
      id: this.id,
      closingDate: this.closingDate,
      employeeId: this.employeeId,
      employeeName: this.employeeName,
      tpa: this.tpa,
      uber: this.uber,
      glovo: this.glovo,
      bolt: this.bolt,
      eatz: this.eatz,
      cashSales: this.cashSales,
      cashIn: this.cashIn,
      cashOut: this.cashOut,
      cashDrawerOpen: this.cashDrawerOpen,
      cashDrawerTotal: this.cashDrawerTotal,
      totalCalculated: this.totalCalculated,
      vendusTotal: this.vendusTotal,
      sangriaAmount: this.sangriaAmount,
      notes: this.notes,
      status: this.status,
      managerNotes: this.managerNotes,
      reviewedAt: this.reviewedAt,
      submittedAt: this.submittedAt,
      sessionOpenedAt: this.sessionOpenedAt,
      drawerDenominations: this.drawerDenominations,
      airMenuUber: this.airMenuUber,
      airMenuGlovo: this.airMenuGlovo,
      airMenuBolt: this.airMenuBolt,
    };
  }
}

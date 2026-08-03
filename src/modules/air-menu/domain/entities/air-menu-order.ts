export interface AirMenuOrderItem {
  title: string;
  plu: string;
  price: number;
  count: number;
}

export interface AirMenuFlag {
  key: string;
  operator: string;
  datetime: number;
}

export type AirMenuDocumentType = "invoice" | "credit_note";

function deriveDocumentType(flags: AirMenuFlag[]): AirMenuDocumentType {
  if (flags.some((f) => f.key === "CANCEL")) return "credit_note";
  return "invoice";
}

function deriveDocumentDate(flags: AirMenuFlag[], documentType: AirMenuDocumentType, fallback: Date): Date {
  const relevantKey = documentType === "credit_note" ? "CANCEL" : "FATURAR";
  const flag = flags.find((f) => f.key === relevantKey);
  return flag ? new Date(flag.datetime) : fallback;
}

export class AirMenuOrder {
  private constructor(
    readonly orderId: string,
    readonly platform: string,
    readonly divisionName: string,
    readonly orderDate: Date,
    readonly documentDate: Date,
    readonly paymentMethod: string,
    readonly items: AirMenuOrderItem[],
    readonly total: number,
    readonly firstName: string,
    readonly lastName: string,
    readonly activeFlags: AirMenuFlag[],
    readonly providerOrderId: string | null,
    readonly documentType: AirMenuDocumentType,
    readonly extraInfo: Record<string, string>,
    readonly rawData: Record<string, unknown>[],
  ) {}

  static create(props: {
    orderId: string;
    platform: string;
    divisionName: string;
    orderDate: Date;
    paymentMethod: string;
    items: AirMenuOrderItem[];
    firstName: string;
    lastName: string;
    activeFlags: AirMenuFlag[];
    providerOrderId: string | null;
    extraInfo: Record<string, string>;
    rawData: Record<string, unknown>[];
  }): AirMenuOrder {
    const documentType = deriveDocumentType(props.activeFlags);
    const documentDate = deriveDocumentDate(props.activeFlags, documentType, props.orderDate);
    const rawTotal = props.items.reduce(
      (sum, item) => sum + item.price * item.count,
      0,
    );
    const total = documentType === "credit_note" ? -rawTotal : rawTotal;

    return new AirMenuOrder(
      props.orderId,
      props.platform,
      props.divisionName,
      props.orderDate,
      documentDate,
      props.paymentMethod,
      props.items,
      total,
      props.firstName,
      props.lastName,
      props.activeFlags,
      props.providerOrderId,
      documentType,
      props.extraInfo,
      props.rawData,
    );
  }
}

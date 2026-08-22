export type CustomerRelationship = "new" | "recurring" | "vip";

export type CustomerStatusThresholds = {
  vipMinOrders: number;
  vipMinLtv: number;
  noOrderInactiveDays: number;
  oneOrderInactiveDays: number;
  repeatInactiveDays: number;
};

export type CustomerStatus = {
  relationship: CustomerRelationship;
  inactive: boolean;
  inactiveReason: "manual" | "no_order" | "one_order" | "repeat" | null;
};

const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00Z`);

export function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.floor((dateOnly(to).getTime() - dateOnly(from).getTime()) / 86_400_000));
}

export function calculateCustomerStatus(input: {
  orderCount: number;
  ltv: number;
  registeredAt: string;
  lastOrderDate: string | null;
  manuallyInactive: boolean;
  today: string;
  thresholds: CustomerStatusThresholds;
}): CustomerStatus {
  const { orderCount, ltv, registeredAt, lastOrderDate, manuallyInactive, today, thresholds } = input;
  const relationship: CustomerRelationship =
    orderCount >= thresholds.vipMinOrders || ltv >= thresholds.vipMinLtv
      ? "vip"
      : orderCount >= 2
        ? "recurring"
        : "new";

  if (manuallyInactive) return { relationship, inactive: true, inactiveReason: "manual" };

  if (orderCount === 0 && daysBetween(registeredAt, today) > thresholds.noOrderInactiveDays) {
    return { relationship, inactive: true, inactiveReason: "no_order" };
  }
  if (orderCount === 1 && lastOrderDate && daysBetween(lastOrderDate, today) > thresholds.oneOrderInactiveDays) {
    return { relationship, inactive: true, inactiveReason: "one_order" };
  }
  if (orderCount >= 2 && lastOrderDate && daysBetween(lastOrderDate, today) > thresholds.repeatInactiveDays) {
    return { relationship, inactive: true, inactiveReason: "repeat" };
  }
  return { relationship, inactive: false, inactiveReason: null };
}

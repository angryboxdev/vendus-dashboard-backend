import type { GetOrdersPort } from "../../domain/ports/in/get-orders.port.js";
import type {
  AirMenuGatewayPort,
  RawOrderItemInstance,
} from "../../domain/ports/out/air-menu-gateway.port.js";
import type { SessionManagerService } from "../../domain/services/session-manager.service.js";
import {
  AirMenuOrder,
  type AirMenuFlag,
  type AirMenuOrderItem,
} from "../../domain/entities/air-menu-order.js";
import { extractItems } from "../../domain/services/order-item-extractor.js";

function derivePlatform(divisionName: string): string {
  const lower = divisionName.toLowerCase();
  if (lower.includes("glovo")) return "Glovo";
  if (lower.includes("uber")) return "Uber Eats";
  if (lower.includes("bolt")) return "Bolt Food";
  return divisionName;
}

function normalizeExtraInfo(
  extraInfo: RawOrderItemInstance["extraInfo"],
): Record<string, string> {
  if (!extraInfo) return {};
  const info = Array.isArray(extraInfo) ? extraInfo[0] : extraInfo;
  return info ?? {};
}

function getProviderOrderId(
  extraInfo: RawOrderItemInstance["extraInfo"],
): string | null {
  const info = normalizeExtraInfo(extraInfo);
  return info["AM_PROVIDER_ORDER_ID"] ?? null;
}

export class GetOrdersUseCase implements GetOrdersPort {
  constructor(
    private readonly sessionManager: SessionManagerService,
    private readonly gateway: AirMenuGatewayPort,
  ) {}

  async execute(enterpriseId: string, startDate: Date, endDate: Date): Promise<AirMenuOrder[]> {
    const session = await this.sessionManager.getValidSession();

    const orderIds = await this.gateway.getOrderIds(
      session.sessionId,
      enterpriseId,
      startDate.getTime(),
      endDate.getTime(),
    );

    if (orderIds.length === 0) return [];

    const rawOrdersList = await Promise.all(
      orderIds.map((id) =>
        this.gateway.getOrders(session.sessionId, enterpriseId, id),
      ),
    );

    const mergedRawOrders: Record<string, RawOrderItemInstance[]> = {};
    for (const rawOrders of rawOrdersList) {
      for (const [divisionName, instances] of Object.entries(rawOrders)) {
        mergedRawOrders[divisionName] ??= [];
        mergedRawOrders[divisionName].push(...instances);
      }
    }

    console.log(
      `[AirMenu] GetOrders enterpriseId=${enterpriseId}: ${Object.keys(mergedRawOrders).length} divisões`,
    );

    const orderMap = new Map<
      string,
      { baseProps: Parameters<typeof AirMenuOrder.create>[0]; items: AirMenuOrderItem[]; rawInstances: Record<string, unknown>[] }
    >();

    for (const [divisionName, instances] of Object.entries(mergedRawOrders)) {
      for (const instance of instances) {
        const orderId = String(instance.orderId ?? "");
        if (!orderId) continue;

        if (!orderMap.has(orderId)) {
          orderMap.set(orderId, {
            baseProps: {
              orderId,
              platform: derivePlatform(divisionName),
              divisionName,
              orderDate: new Date(instance.orderDate ?? Date.now()),
              paymentMethod: instance.paymentMethod ?? "",
              items: [],
              firstName: instance.firstName ?? "",
              lastName: instance.lastName ?? "",
              activeFlags: (instance.activeFlags ?? []) as AirMenuFlag[],
              providerOrderId: getProviderOrderId(instance.extraInfo),
              extraInfo: normalizeExtraInfo(instance.extraInfo),
              rawData: [],
            },
            items: [],
            rawInstances: [],
          });
        }

        const entry = orderMap.get(orderId)!;
        entry.rawInstances.push(instance as unknown as Record<string, unknown>);
        entry.items.push(...extractItems(instance.childs));
      }
    }

    return Array.from(orderMap.values())
      .map(({ baseProps, items, rawInstances }) => AirMenuOrder.create({ ...baseProps, items, rawData: rawInstances }))
      .filter((o) => o.documentDate >= startDate && o.documentDate <= endDate)
      .sort((a, b) => b.documentDate.getTime() - a.documentDate.getTime());
  }
}

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

export const BATCH_SIZE = 5;
export const BATCH_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
    private readonly batchSize: number = BATCH_SIZE,
    private readonly batchDelayMs: number = BATCH_DELAY_MS,
  ) {}

  async execute(enterpriseId: string, startDate: Date, endDate: Date): Promise<AirMenuOrder[]> {
    const session = await this.sessionManager.getValidSession();

    const { value: orderIds, sessionId } = await this.withReauth(session.sessionId, (sid) =>
      this.gateway.getOrderIds(sid, enterpriseId, startDate.getTime(), endDate.getTime()),
    );

    if (orderIds.length === 0) return [];

    // Probe a single order first: if the session is stale we re-authenticate and fail fast
    // instead of firing every batch (AirMenu revokes the API key on rate-limit abuse).
    const [probeId, ...restIds] = orderIds as [string, ...string[]];
    const { value: probeOrders, sessionId: activeSessionId } = await this.withReauth(sessionId, (sid) =>
      this.gateway.getOrders(sid, enterpriseId, probeId),
    );

    const rawOrdersList: Record<string, RawOrderItemInstance[]>[] = [probeOrders];
    for (let i = 0; i < restIds.length; i += this.batchSize) {
      await sleep(this.batchDelayMs);
      const batch = restIds.slice(i, i + this.batchSize);
      const settled = await Promise.allSettled(
        batch.map((id) => this.gateway.getOrders(activeSessionId, enterpriseId, id)),
      );
      for (const r of settled) {
        if (r.status === "rejected") {
          console.warn(`[AirMenu] GetOrders skipped order (API error): ${String(r.reason)}`);
          continue;
        }
        rawOrdersList.push(r.value);
      }
    }

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

  private async withReauth<T>(
    sessionId: string,
    call: (sessionId: string) => Promise<T>,
  ): Promise<{ value: T; sessionId: string }> {
    try {
      return { value: await call(sessionId), sessionId };
    } catch {
      // Session may have been invalidated externally (e.g. another login replaced it).
      // Re-authenticate and retry this single call once.
      this.sessionManager.invalidate();
      await sleep(this.batchDelayMs);
      const fresh = await this.sessionManager.getValidSession();
      return { value: await call(fresh.sessionId), sessionId: fresh.sessionId };
    }
  }
}

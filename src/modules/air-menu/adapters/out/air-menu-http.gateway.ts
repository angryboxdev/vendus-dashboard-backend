import type {
  AirMenuGatewayPort,
  AuthenticateResult,
  CreateWebhookInput,
  CreateWebhookResult,
  RawMenuNode,
  RawOrderItemInstance,
} from "../../domain/ports/out/air-menu-gateway.port.js";

const BASE_URL = "https://www.airmenu.com/AirMenuAPI";
const VERSION = "1.0.0";

interface AirMenuResponseBase {
  action: string;
  version: string;
  status: string;
  statusCode: number;
  errorCode?: number;
  errorName?: string;
  message?: string;
}

interface AuthenticateResponse extends AirMenuResponseBase {
  sessionId: string;
  enterpriseIds: string[];
  enterpriseNames: string[];
}

interface GetOrderIdsResponse extends AirMenuResponseBase {
  orderIds: string[];
  orderLimitReached: boolean;
}

interface GetOrdersResponse extends AirMenuResponseBase {
  orders: Record<string, RawOrderItemInstance[]>;
}

interface DivisionTreeNode {
  id: string;
  name: string;
  childDivisions?: DivisionTreeNode[];
}

interface GetEnterpriseDivisionIdsResponse extends AirMenuResponseBase {
  /** Mapa nome-divisão → id. Ex: { "Angry Box Uber": "559069" } */
  divisions: Record<string, string>;
  divisionTree?: DivisionTreeNode[];
}

interface GetMenuResponse extends AirMenuResponseBase {
  menu: RawMenuNode[];
}

async function callApi<T extends AirMenuResponseBase>(
  action: string,
  apiKey: string,
  data: Record<string, unknown>,
): Promise<T> {
  const dataStr = JSON.stringify(data);
  const url = `${BASE_URL}?ACTION=${action}&VERSION=${VERSION}&KEY=${encodeURIComponent(apiKey)}&DATA=${encodeURIComponent(dataStr)}`;

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`AirMenu: HTTP ${res.status} ao chamar ${action}`);
  }

  const text = await res.text();

  // Resposta no formato: RESULT={...json...}
  const params = new URLSearchParams(text);
  const resultStr = params.get("RESULT");
  if (!resultStr) {
    throw new Error(
      `AirMenu: formato de resposta inesperado em ${action}: ${text.slice(0, 200)}`,
    );
  }

  const parsed = JSON.parse(resultStr) as T;
  if (parsed.statusCode !== 1) {
    throw new Error(
      `AirMenu ${action} falhou: ${parsed.message ?? parsed.status}`,
    );
  }
  return parsed;
}

export class AirMenuHttpGateway implements AirMenuGatewayPort {
  constructor(private readonly apiKey: string) {}

  async authenticate(
    username: string,
    password: string,
  ): Promise<AuthenticateResult> {
    const res = await callApi<AuthenticateResponse>("Authenticate", this.apiKey, {
      username,
      password,
    });
    return { sessionId: res.sessionId };
  }

  async getOrderIds(
    sessionId: string,
    enterpriseId: string,
    startDate: number,
    endDate: number,
  ): Promise<string[]> {
    const res = await callApi<GetOrderIdsResponse>("GetOrderIds", this.apiKey, {
      sessionId,
      enterpriseId,
      startDate,
      endDate,
    });
    return res.orderIds ?? [];
  }

  async getOrders(
    sessionId: string,
    enterpriseId: string,
    orderId: string,
  ): Promise<Record<string, RawOrderItemInstance[]>> {
    const res = await callApi<GetOrdersResponse>("GetOrders", this.apiKey, {
      sessionId,
      enterpriseId,
      orderId,
    });
    return res.orders ?? {};
  }

  async getEnterpriseDivisionIds(sessionId: string, enterpriseId: string): Promise<string[]> {
    const res = await callApi<GetEnterpriseDivisionIdsResponse>(
      "GetEnterpriseDivisionIds",
      this.apiKey,
      { sessionId, enterpriseId },
    );
    const parentIds = Object.values(res.divisions ?? {});
    const childIds = (res.divisionTree ?? []).flatMap((node) =>
      (node.childDivisions ?? []).map((c) => c.id),
    );
    return [...new Set([...parentIds, ...childIds])];
  }

  async getMenu(
    sessionId: string,
    enterpriseId: string,
    divisionId: string,
  ): Promise<RawMenuNode[]> {
    const res = await callApi<GetMenuResponse>("GetMenu", this.apiKey, {
      sessionId,
      enterpriseId,
      divisionId,
      weekTime: 1,
    });
    return res.menu ?? [];
  }

  async createWebhook(input: CreateWebhookInput): Promise<CreateWebhookResult> {
    interface CreateWebhookResponse extends AirMenuResponseBase {
      webhookId: string;
      url: string;
      events: string[];
      resource: string;
      active: boolean;
    }

    const data: Record<string, unknown> = {
      sessionId: input.sessionId,
      enterpriseId: input.enterpriseId,
      url: input.url,
    };
    if (input.events !== undefined) data["events"] = input.events;
    if (input.resource !== undefined) data["resource"] = input.resource;
    if (input.secret !== undefined) data["secret"] = input.secret;
    if (input.active !== undefined) data["active"] = input.active;

    const res = await callApi<CreateWebhookResponse>("CreateWebhook", this.apiKey, data);
    return {
      webhookId: res.webhookId,
      url: res.url,
      events: res.events,
      resource: res.resource,
      active: res.active,
    };
  }
}

export interface AuthenticateResult {
  sessionId: string;
}

export interface RawMenuNode {
  title: string;
  menuRelation: string;
  plu?: string;
  tax?: number;
  price?: number;
  childs: RawMenuNode[];
}

export interface RawOrderItemInstance {
  title: string;
  menuRelation: string;
  childs: RawOrderItemInstance[];
  plu?: string;
  count?: number;
  price?: number;
  id?: string;
  available?: boolean;
  orderId?: string | number;
  orderCounter?: number;
  orderDate?: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  paymentMethod?: string;
  employee?: string;
  employeePwd?: string;
  extraInfo?: Array<Record<string, string>> | Record<string, string>;
  activeFlags?: Array<{ key: string; operator: string; datetime: number }>;
  trackingUrl?: string;
  bookingTime?: number;
}

export interface AirMenuGatewayPort {
  authenticate(username: string, password: string): Promise<AuthenticateResult>;
  getOrderIds(
    sessionId: string,
    enterpriseId: string,
    startDate: number,
    endDate: number,
  ): Promise<string[]>;
  getOrders(
    sessionId: string,
    enterpriseId: string,
    orderId: string,
  ): Promise<Record<string, RawOrderItemInstance[]>>;
  getEnterpriseDivisionIds(sessionId: string, enterpriseId: string): Promise<string[]>;
  getMenu(sessionId: string, enterpriseId: string, divisionId: string): Promise<RawMenuNode[]>;
}

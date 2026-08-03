export interface GetOrderRawPort {
  execute(enterpriseId: string, orderId: string): Promise<Record<string, unknown>[]>;
}

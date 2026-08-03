import type { Router } from "express";
import { AirMenuHttpGateway } from "./adapters/out/air-menu-http.gateway.js";
import { AirMenuMenuCatalogAdapter } from "./adapters/out/air-menu-menu-catalog.adapter.js";
import { SessionManagerService } from "./domain/services/session-manager.service.js";
import { GetOrdersUseCase } from "./application/use-cases/get-orders.use-case.js";
import { GetEnterprisesUseCase } from "./application/use-cases/get-enterprises.use-case.js";
import { GetSummaryUseCase } from "./application/use-cases/get-summary.use-case.js";
import { GetOrderRawUseCase } from "./application/use-cases/get-order-raw.use-case.js";
import { AirMenuController } from "./adapters/in/air-menu.controller.js";
import type { AirMenuEnterprise } from "./domain/entities/air-menu-enterprise.js";

export function createAirMenuModule(config: {
  apiKey: string;
  username: string;
  password: string;
  enterprises: AirMenuEnterprise[];
}): { router: Router } {
  const gateway = new AirMenuHttpGateway(config.apiKey);

  const sessionManager = new SessionManagerService(
    gateway,
    config.username,
    config.password,
    config.enterprises,
  );

  const getOrders = new GetOrdersUseCase(sessionManager, gateway);
  const getEnterprises = new GetEnterprisesUseCase(config.enterprises);
  const menuCatalog = new AirMenuMenuCatalogAdapter(gateway, sessionManager);
  const getSummary = new GetSummaryUseCase(getOrders, menuCatalog);
  const getOrderRaw = new GetOrderRawUseCase(sessionManager, gateway);

  const controller = new AirMenuController(getEnterprises, getSummary, getOrderRaw);

  return { router: controller.router };
}

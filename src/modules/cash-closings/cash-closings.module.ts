import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { ENV } from "../../config/env.js";
import { hashPin } from "../../utils/kiosk.js";

import { SupabaseCashClosingRepository } from "./adapters/out/supabase-cash-closing.repository.js";
import { SupabaseEmployeeRepository } from "./adapters/out/supabase-employee.repository.js";
import { VendusRegisterSessionsGateway } from "./adapters/out/vendus-register-sessions.gateway.js";
import { AirMenuDeliveryGateway } from "./adapters/out/air-menu-delivery.gateway.js";
import type { GetSummaryPort } from "../air-menu/domain/ports/in/get-summary.port.js";
import type { VendusGatewayPort } from "../vendus/domain/ports/out/vendus-gateway.port.js";

import { VerifyPinUseCase } from "./application/use-cases/verify-pin.use-case.js";
import { SubmitClosingUseCase } from "./application/use-cases/submit-closing.use-case.js";
import { ListClosingsUseCase } from "./application/use-cases/list-closings.use-case.js";
import { GetClosingUseCase } from "./application/use-cases/get-closing.use-case.js";
import { ReviewClosingUseCase } from "./application/use-cases/review-closing.use-case.js";
import { GetAvailableSessionsUseCase } from "./application/use-cases/get-available-sessions.use-case.js";
import { GetAirMenuTotalsUseCase } from "./application/use-cases/get-airmenu-totals.use-case.js";

import { CashClosingController } from "./adapters/in/cash-closing.controller.js";

export interface CashClosingsModule {
  /** Rotas públicas (sem autenticação): verify-pin, submit, sessions. */
  publicRouter: Router;
  /** Rotas protegidas (manager+): list, get, patch. */
  managedRouter: Router;
}

/**
 * Composition root do módulo cash-closings (spec B2 ticket 03 — o módulo que
 * exercita a decisão de location e de unattended scope; ver a secção Ports
 * do README do módulo).
 *
 * Único lugar que conhece as implementações concretas dos adapters. Seguindo
 * D2, os adapters não constroem o seu próprio `ScopedQuery`: recebem o
 * factory `createScopedQuery` injectado aqui e constroem um helper escopado
 * por chamada.
 *
 * @param vendusGateway  - VendusGatewayPort do módulo vendus (injectado pelo servidor).
 *   Usado para buscar movimentos de caixa e documentos ao calcular sessões.
 * @param airMenuSummary - GetSummaryPort do módulo air-menu (injectado pelo servidor).
 *   Opcional: se ausente, os totais AirMenu ficam null nos fechos submetidos.
 */
export function createCashClosingsModule(
  vendusGateway: VendusGatewayPort,
  airMenuSummary?: GetSummaryPort,
): CashClosingsModule {
  // Adapters de saída
  const closingRepository = new SupabaseCashClosingRepository(createScopedQuery);
  const employeeRepository = new SupabaseEmployeeRepository(createScopedQuery);
  const sessionsGateway = new VendusRegisterSessionsGateway(ENV.VENDUS_REGISTER_ID, vendusGateway);

  const airMenuGateway =
    airMenuSummary && ENV.AIRMENU_CLOSING_ENTERPRISE_ID
      ? new AirMenuDeliveryGateway(airMenuSummary, ENV.AIRMENU_CLOSING_ENTERPRISE_ID)
      : undefined;

  // Função de hash injectada no use case (evita dependência directa de infra no domínio)
  const hashPinFn = (pin: string) => hashPin(ENV.HR_KIOSK_HMAC_SECRET, pin);

  // Use cases
  const verifyPin = new VerifyPinUseCase(employeeRepository, hashPinFn);
  const submitClosing = new SubmitClosingUseCase(
    closingRepository,
    employeeRepository,
    sessionsGateway,
    airMenuGateway,
  );
  const listClosings = new ListClosingsUseCase(closingRepository);
  const getClosing = new GetClosingUseCase(closingRepository);
  const reviewClosing = new ReviewClosingUseCase(closingRepository);
  const getAvailableSessions = new GetAvailableSessionsUseCase(sessionsGateway, closingRepository);
  const getAirMenuTotals = new GetAirMenuTotalsUseCase(airMenuGateway);

  // Adapter de entrada (HTTP)
  const controller = new CashClosingController(
    verifyPin,
    submitClosing,
    listClosings,
    getClosing,
    reviewClosing,
    getAvailableSessions,
    getAirMenuTotals,
  );

  return {
    publicRouter: controller.publicRouter,
    managedRouter: controller.managedRouter,
  };
}

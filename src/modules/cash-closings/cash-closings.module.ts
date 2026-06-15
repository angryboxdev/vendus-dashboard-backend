import type { Router } from "express";
import { getSupabaseServiceRole } from "../../infra/supabaseClient.js";
import { ENV } from "../../config/env.js";
import { hashPin } from "../../utils/kiosk.js";

import { SupabaseCashClosingRepository } from "./adapters/out/supabase-cash-closing.repository.js";
import { SupabaseEmployeeRepository } from "./adapters/out/supabase-employee.repository.js";
import { VendusRegisterSessionsGateway } from "./adapters/out/vendus-register-sessions.gateway.js";

import { VerifyPinUseCase } from "./application/use-cases/verify-pin.use-case.js";
import { SubmitClosingUseCase } from "./application/use-cases/submit-closing.use-case.js";
import { ListClosingsUseCase } from "./application/use-cases/list-closings.use-case.js";
import { GetClosingUseCase } from "./application/use-cases/get-closing.use-case.js";
import { ReviewClosingUseCase } from "./application/use-cases/review-closing.use-case.js";
import { GetAvailableSessionsUseCase } from "./application/use-cases/get-available-sessions.use-case.js";

import { CashClosingController } from "./adapters/in/cash-closing.controller.js";

export interface CashClosingsModule {
  /** Rotas públicas (sem autenticação): verify-pin, submit, sessions. */
  publicRouter: Router;
  /** Rotas protegidas (manager+): list, get, patch. */
  managedRouter: Router;
}

/**
 * Composition root do módulo cash-closings.
 *
 * Único lugar que conhece as implementações concretas dos adapters.
 * Os use cases e o domínio apenas conhecem interfaces (ports).
 */
export function createCashClosingsModule(): CashClosingsModule {
  const supabase = getSupabaseServiceRole();
  if (!supabase) throw new Error("Supabase service role não configurado");

  // Adapters de saída
  const closingRepository = new SupabaseCashClosingRepository(supabase);
  const employeeRepository = new SupabaseEmployeeRepository(supabase);
  const sessionsGateway = new VendusRegisterSessionsGateway(ENV.VENDUS_REGISTER_ID);

  // Função de hash injectada no use case (evita dependência directa de infra no domínio)
  const hashPinFn = (pin: string) => hashPin(ENV.HR_KIOSK_HMAC_SECRET, pin);

  // Use cases
  const verifyPin = new VerifyPinUseCase(employeeRepository, hashPinFn);
  const submitClosing = new SubmitClosingUseCase(
    closingRepository,
    employeeRepository,
    sessionsGateway,
  );
  const listClosings = new ListClosingsUseCase(closingRepository);
  const getClosing = new GetClosingUseCase(closingRepository);
  const reviewClosing = new ReviewClosingUseCase(closingRepository);
  const getAvailableSessions = new GetAvailableSessionsUseCase(sessionsGateway, closingRepository);

  // Adapter de entrada (HTTP)
  const controller = new CashClosingController(
    verifyPin,
    submitClosing,
    listClosings,
    getClosing,
    reviewClosing,
    getAvailableSessions,
  );

  return {
    publicRouter: controller.publicRouter,
    managedRouter: controller.managedRouter,
  };
}

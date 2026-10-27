import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { listOrganizations } from "../../infra/scoped-db/organization-listing.js";
import type { ImportInvoiceFromEmailPort } from "../invoices/domain/ports/in/email-import.ports.js";
import type { EmailIntakeConfig } from "./domain/ports/out/email-intake.out-ports.js";
import type { ProcessInboundAttachmentsPort } from "./domain/ports/in/email-intake.ports.js";
import { SupabaseInboundAddressRepository } from "./adapters/out/supabase-inbound-address.repository.js";
import { SupabaseInboundAttachmentRepository } from "./adapters/out/supabase-inbound-attachment.repository.js";
import { SupabaseIntakeSettingsRepository } from "./adapters/out/supabase-intake-settings.repository.js";
import { InfraInboundEmailStoreAdapter } from "./adapters/out/infra-inbound-email-store.adapter.js";
import { ResendReceivingAdapter } from "./adapters/out/resend-receiving.adapter.js";
import { InvoicesIntakeAdapter } from "./adapters/out/invoices-intake.adapter.js";
import { NodeRandomBytesAdapter } from "./adapters/out/node-random-bytes.adapter.js";
import { SupabaseInvoiceExistenceAdapter } from "./adapters/out/supabase-invoice-existence.adapter.js";
import { ReceiveInboundEmailUseCase } from "./application/use-cases/receive-inbound-email.use-case.js";
import { ProcessInboundAttachmentsUseCase } from "./application/use-cases/process-inbound-attachments.use-case.js";
import {
  GetEmailIntakeUseCase,
  RotateInboundAddressUseCase,
  SetEmailIntakeDestinationUseCase,
} from "./application/use-cases/email-intake-settings.use-cases.js";
import { createEmailIntakeRouter } from "./adapters/in/email-intake.controller.js";
import { createResendWebhookHandler } from "./adapters/in/resend-webhook.controller.js";

export interface EmailIntakeEnv {
  resendApiKey: string | null;
  webhookSecret: string | null;
  domain: string | null;
  /** Piloto: só estas empresas geram endereço (vazio = todas). */
  allowedOrganizationIds: string[];
}

export interface InvoiceEmailIntakeModule {
  /** Rotas autenticadas do ecrã «Faturas por email». */
  router: Router;
  /** `POST /api/webhooks/resend` — montar com `express.raw`, ANTES do express.json global e da autenticação. */
  webhookHandler: ReturnType<typeof createResendWebhookHandler>;
  /** Novas tentativas (cron): processa os pendentes de todas as empresas. */
  retryPending(): Promise<void>;
  configured: boolean;
}

/** Composition root das Faturas por email (Resend Inbound). */
export function createInvoiceEmailIntakeModule(env: EmailIntakeEnv, importFromEmail: ImportInvoiceFromEmailPort): InvoiceEmailIntakeModule {
  const configured = !!(env.resendApiKey && env.webhookSecret && env.domain);
  const config: EmailIntakeConfig = {
    configured,
    domain: env.domain ? env.domain.trim().toLowerCase() : null,
    allowedOrganizationIds: env.allowedOrganizationIds,
  };

  const addresses = new SupabaseInboundAddressRepository(createScopedQuery);
  const attachments = new SupabaseInboundAttachmentRepository(createScopedQuery);
  const settings = new SupabaseIntakeSettingsRepository(createScopedQuery);
  const store = new InfraInboundEmailStoreAdapter();
  const resend = new ResendReceivingAdapter(env.resendApiKey ?? "");

  const receive = new ReceiveInboundEmailUseCase(store, store, settings, attachments, config);
  const process: ProcessInboundAttachmentsPort = new ProcessInboundAttachmentsUseCase(attachments, resend, new InvoicesIntakeAdapter(importFromEmail));

  const router = createEmailIntakeRouter({
    getEmailIntake: new GetEmailIntakeUseCase(addresses, attachments, store, settings, config, new SupabaseInvoiceExistenceAdapter(createScopedQuery)),
    rotateAddress: new RotateInboundAddressUseCase(addresses, new NodeRandomBytesAdapter(), config),
    setDestination: new SetEmailIntakeDestinationUseCase(settings),
  });

  let running = false;
  return {
    router,
    webhookHandler: createResendWebhookHandler({ secret: configured ? env.webhookSecret : null, receive, process }),
    configured,
    async retryPending() {
      if (!configured || running) return;
      running = true;
      try {
        for (const org of await listOrganizations()) {
          try {
            const r = await process.execute({ organizationId: org.organizationId });
            if (r.processed > 0) console.log(`[faturas-email] ${org.organizationId}: ${r.imported} importadas, ${r.duplicates} duplicadas, ${r.rejected} rejeitadas, ${r.failed} com erro`);
          } catch (e) {
            console.error("[faturas-email] novas tentativas falharam:", e instanceof Error ? e.message : e);
          }
        }
      } finally {
        running = false;
      }
    },
  };
}

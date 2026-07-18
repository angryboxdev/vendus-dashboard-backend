import { Router } from 'express';
import type { GetPendingDeliveriesPort, UpdateDeliveryStatusPort } from '../../domain/ports/in/kds.ports.js';
import type { DeliveryStatus } from '../../domain/entities/delivery.js';

const VALID_STATUSES: DeliveryStatus[] = [
  'pending',
  'received',
  'cooking',
  'waiting_to_delivery',
  'delivered',
  'canceled',
];

export class KdsController {
  readonly router: Router;

  constructor(
    private readonly getDeliveries: GetPendingDeliveriesPort,
    private readonly updateStatus: UpdateDeliveryStatusPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /**
     * GET /kds/deliveries
     * Retorna pedidos activos do Vendus (pending/received/cooking/waiting_to_delivery).
     */
    this.router.get('/kds/deliveries', async (_req, res) => {
      try {
        const deliveries = await this.getDeliveries.execute();
        res.json({ deliveries });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Internal error';
        res.status(500).json({ error: msg });
      }
    });

    /**
     * PATCH /kds/deliveries/:id/status
     * Body: { status: DeliveryStatus }
     * Avança o estado de um pedido no Vendus.
     */
    this.router.patch('/kds/deliveries/:id/status', async (req, res) => {
      try {
        const id = Number(req.params['id']);
        if (isNaN(id)) {
          res.status(400).json({ error: 'Invalid id' });
          return;
        }
        const body = req.body as { status?: unknown };
        if (
          typeof body.status !== 'string' ||
          !VALID_STATUSES.includes(body.status as DeliveryStatus)
        ) {
          res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
          return;
        }
        await this.updateStatus.execute({ id, status: body.status as DeliveryStatus });
        res.status(204).send();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Internal error';
        res.status(500).json({ error: msg });
      }
    });
  }
}

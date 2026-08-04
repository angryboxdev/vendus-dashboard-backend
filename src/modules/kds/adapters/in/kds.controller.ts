import { Router } from 'express';
import type { GetPendingDeliveriesPort, UpdateDeliveryStatusPort } from '../../domain/ports/in/kds.ports.js';
import type { DeliveryStatus } from '../../domain/entities/delivery.js';
import type { AirMenuKdsStorePort } from '../../domain/ports/out/air-menu-kds-store.port.js';

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
    private readonly airMenuStore: AirMenuKdsStorePort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /**
     * GET /kds/stream
     * Server-Sent Events: emite pedidos AirMenu em tempo real (novos + actualizações de status).
     *
     * Ao conectar:
     *   1. Recebe `event: connected`
     *   2. Recebe `event: delivery` para cada pedido AirMenu já em memória (replay)
     *   3. Recebe `event: delivery` sempre que um pedido chega ou muda de status
     *
     * O frontend trata `event: delivery` como upsert (add se novo, update se já existia).
     */
    this.router.get('/kds/stream', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      res.write(`event: connected\ndata: {}\n\n`);

      // Replay current state so late-connecting screens catch up
      for (const delivery of this.airMenuStore.getAll()) {
        res.write(`event: delivery\ndata: ${JSON.stringify(delivery)}\n\n`);
      }

      // Subscribe to all future changes (new orders + status updates)
      const unsubscribe = this.airMenuStore.subscribe((delivery) => {
        res.write(`event: delivery\ndata: ${JSON.stringify(delivery)}\n\n`);
      });

      const heartbeat = setInterval(() => {
        res.write(`: heartbeat\n\n`);
      }, 30_000);

      req.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    });

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
     * Avança o estado de um pedido Vendus.
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

    /**
     * PATCH /kds/air-menu-deliveries/:id/status
     * Body: { status: DeliveryStatus }
     * Avança o estado de um pedido AirMenu (em memória). Broadcast automático via SSE.
     */
    this.router.patch('/kds/air-menu-deliveries/:id/status', (req, res) => {
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
      const updated = this.airMenuStore.updateStatus(id, body.status as DeliveryStatus);
      if (!updated) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }
      res.status(204).send();
    });
  }
}

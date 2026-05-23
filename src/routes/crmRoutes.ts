import { Router } from "express";
import {
  listCustomers,
  enrichCustomer,
  getCustomerEnriched,
  createCustomer,
  updateCustomer,
  updateCustomerTags,
} from "../services/crmCustomerService.js";
import { listOrders, createOrder, updateOrder } from "../services/crmOrderService.js";
import { listContacts, createContact, updateContact } from "../services/crmContactService.js";
import { listScripts, getScript, updateScript, renderScriptBody } from "../services/crmScriptService.js";
import { listParameters, updateParameter } from "../services/crmParameterService.js";
import { getDashboard } from "../services/crmDashboardService.js";
import {
  customerCreateBodySchema,
  orderCreateBodySchema,
  contactCreateBodySchema,
} from "../domain/crmTypes.js";

export const crmRoutes = Router();

// ─── Dashboard ────────────────────────────────────────────────────────────────

crmRoutes.get("/crm/dashboard", async (_req, res) => {
  try {
    const data = await getDashboard();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Clientes ─────────────────────────────────────────────────────────────────

crmRoutes.get("/crm/customers", async (req, res) => {
  try {
    const q = req.query as Record<string, string>;
    const filters: Parameters<typeof listCustomers>[0] = {};
    if (q.segment) filters.segment = q.segment;
    if (q.tag)     filters.tag     = q.tag;
    if (q.optIn)   filters.optIn   = q.optIn;
    if (q.channel) filters.channel = q.channel;
    if (q.search)  filters.search  = q.search;
    if (q.inactive === "true")  filters.inactive = true;
    if (q.inactive === "false") filters.inactive = false;
    if (q.limit)  filters.limit  = parseInt(q.limit, 10);
    if (q.offset) filters.offset = parseInt(q.offset, 10);
    const customers = await listCustomers(filters);
    if (q.enriched === "true") {
      const batchSize = 20;
      const enrichedList = [];
      for (let i = 0; i < customers.length; i += batchSize) {
        const batch = customers.slice(i, i + batchSize);
        const results = await Promise.all(batch.map((c) => enrichCustomer(c)));
        enrichedList.push(...results);
      }
      // Filter by segment after enrichment if requested
      const seg = q.segment;
      res.json(seg ? enrichedList.filter((c) => c.segment === seg) : enrichedList);
      return;
    }
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

crmRoutes.post("/crm/customers", async (req, res) => {
  try {
    const parsed = customerCreateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const customer = await createCustomer(parsed.data);
    res.status(201).json(customer);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

crmRoutes.get("/crm/customers/:id", async (req, res) => {
  try {
    const customer = await getCustomerEnriched(req.params.id);
    if (!customer) { res.status(404).json({ error: "Cliente não encontrado" }); return; }
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

crmRoutes.patch("/crm/customers/:id", async (req, res) => {
  try {
    const customer = await updateCustomer(req.params.id, req.body as Record<string, unknown>);
    if (!customer) { res.status(404).json({ error: "Cliente não encontrado" }); return; }
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

crmRoutes.post("/crm/customers/:id/tags", async (req, res) => {
  try {
    const { add = [], remove = [] } = req.body as { add?: string[]; remove?: string[] };
    const tags = await updateCustomerTags(req.params.id, add, remove);
    res.json({ tags });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Pedidos ──────────────────────────────────────────────────────────────────

crmRoutes.get("/crm/customers/:id/orders", async (req, res) => {
  try {
    const orders = await listOrders(req.params.id.toUpperCase());
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

crmRoutes.post("/crm/customers/:id/orders", async (req, res) => {
  try {
    const parsed = orderCreateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const order = await createOrder(req.params.id.toUpperCase(), parsed.data);
    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

crmRoutes.patch("/crm/orders/:orderId", async (req, res) => {
  try {
    const order = await updateOrder(req.params.orderId, req.body as Record<string, unknown>);
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Contactos ────────────────────────────────────────────────────────────────

crmRoutes.get("/crm/contacts", async (req, res) => {
  try {
    const q = req.query as Record<string, string>;
    const filters: Parameters<typeof listContacts>[0] = {};
    if (q.customerId)  filters.customerId  = q.customerId;
    if (q.scriptCode)  filters.scriptCode  = q.scriptCode;
    if (q.channel)     filters.channel     = q.channel;
    if (q.dateFrom)    filters.dateFrom    = q.dateFrom;
    if (q.dateTo)      filters.dateTo      = q.dateTo;
    if (q.status)      filters.status      = q.status;
    if (q.limit)       filters.limit       = parseInt(q.limit, 10);
    if (q.offset)      filters.offset      = parseInt(q.offset, 10);
    const contacts = await listContacts(filters);
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

crmRoutes.post("/crm/contacts", async (req, res) => {
  try {
    const parsed = contactCreateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const contact = await createContact(parsed.data);
    res.status(201).json(contact);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

crmRoutes.patch("/crm/contacts/:id", async (req, res) => {
  try {
    const contact = await updateContact(req.params.id, req.body as Record<string, unknown>);
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Scripts ─────────────────────────────────────────────────────────────────

crmRoutes.get("/crm/scripts", async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const scripts = await listScripts(includeInactive);
    res.json(scripts);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

crmRoutes.get("/crm/scripts/:code", async (req, res) => {
  try {
    const script = await getScript(req.params.code);
    if (!script) { res.status(404).json({ error: "Script não encontrado" }); return; }

    // Se vier customerFirstName no query, renderiza o texto
    const q = req.query as Record<string, string>;
    const vars: Parameters<typeof renderScriptBody>[1] = {};
    if (q.nome)          vars.nome          = q.nome;
    if (q.item)          vars.item          = q.item;
    if (q.codigo)        vars.codigo        = q.codigo;
    if (q.data)          vars.data          = q.data;
    if (q.nomeIndicador) vars.nomeIndicador = q.nomeIndicador;
    if (q.nomeIndicado)  vars.nomeIndicado  = q.nomeIndicado;
    const rendered = renderScriptBody(script.body, vars);

    res.json({ ...script, renderedBody: rendered });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

crmRoutes.patch("/crm/scripts/:code", async (req, res) => {
  try {
    const script = await updateScript(req.params.code, req.body as Record<string, unknown>);
    if (!script) { res.status(404).json({ error: "Script não encontrado" }); return; }
    res.json(script);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Parâmetros ───────────────────────────────────────────────────────────────

crmRoutes.get("/crm/parameters", async (_req, res) => {
  try {
    const params = await listParameters();
    res.json(params);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

crmRoutes.patch("/crm/parameters/:key", async (req, res) => {
  try {
    const { value } = req.body as { value: string };
    if (value === undefined) {
      res.status(400).json({ error: "Campo 'value' obrigatório" });
      return;
    }
    const param = await updateParameter(req.params.key, String(value));
    res.json(param);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

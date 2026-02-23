import { Router } from "express";
import type { Request, Response } from "express";
import {
  createCustoVariavel,
  deleteCustoVariavel,
  getCustosVariaveis,
  updateCustoVariavel,
} from "../services/dreCustosVariaveisService.js";
import type { CustosVariaveisCreateBody, CustosVariaveisUpdateBody } from "../domain/dreTypes.js";

export const dreRoutes = Router();

function toQueryRecord(q: Request["query"]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(q ?? {})) {
    out[k] = Array.isArray(v) ? (v[0] as string) : (v as string);
  }
  return out;
}

function parseYearMonth(query: Record<string, string | undefined>): { year: number; month: number } | null {
  const year = Number(query.year);
  const month = Number(query.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function yearMonthGuard(req: Request, res: Response): { year: number; month: number } | undefined {
  const parsed = parseYearMonth(toQueryRecord(req.query));
  if (!parsed) {
    res.status(400).json({
      error: "Query 'year' (2000-2100) e 'month' (1-12) obrigatórios e válidos",
    });
    return undefined;
  }
  return parsed;
}

dreRoutes.get("/reports/dre/custos-variaveis", async (req, res) => {
  try {
    const period = yearMonthGuard(req, res);
    if (!period) return;
    const payload = await getCustosVariaveis(period.year, period.month);
    res.json(payload);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao obter custos variáveis";
    res.status(500).json({ error: message });
  }
});

dreRoutes.post("/reports/dre/custos-variaveis", async (req, res) => {
  try {
    const period = yearMonthGuard(req, res);
    if (!period) return;
    const body = req.body as CustosVariaveisCreateBody;
    if (!body || typeof body.section !== "string" || !["producao", "venda"].includes(body.section)) {
      res.status(400).json({ error: "Body deve incluir section: 'producao' ou 'venda'" });
      return;
    }
    const item = await createCustoVariavel(period.year, period.month, body);
    res.status(201).json(item);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao criar custo variável";
    res.status(500).json({ error: message });
  }
});

dreRoutes.put("/reports/dre/custos-variaveis/:id", async (req, res) => {
  try {
    const period = yearMonthGuard(req, res);
    if (!period) return;
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "Parâmetro :id obrigatório" });
      return;
    }
    const body = req.body as CustosVariaveisUpdateBody;
    const item = await updateCustoVariavel(id, period.year, period.month, body ?? {});
    res.json(item);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao atualizar custo variável";
    res.status(500).json({ error: message });
  }
});

dreRoutes.delete("/reports/dre/custos-variaveis/:id", async (req, res) => {
  try {
    const period = yearMonthGuard(req, res);
    if (!period) return;
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "Parâmetro :id obrigatório" });
      return;
    }
    await deleteCustoVariavel(id, period.year, period.month);
    res.status(204).send();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao excluir custo variável";
    res.status(500).json({ error: message });
  }
});

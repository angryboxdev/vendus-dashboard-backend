import { Router } from "express";
import { getCustosVariaveis } from "../services/dreCustosVariaveisService.js";

export const dreRoutes = Router();

dreRoutes.get("/reports/dre/custos-variaveis", async (req, res) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      res.status(400).json({ error: "Query 'year' inválido (ex: 2025)" });
      return;
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      res.status(400).json({ error: "Query 'month' inválido (1-12)" });
      return;
    }
    const payload = await getCustosVariaveis(year, month);
    res.json(payload);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao obter custos variáveis";
    res.status(500).json({ error: message });
  }
});

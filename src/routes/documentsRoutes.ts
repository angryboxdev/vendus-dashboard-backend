import { ENV } from "../config/env.js";
import { Router } from "express";
import { vendusGet } from "../infra/vendusClient.js";

export const documentsRoutes = Router();

documentsRoutes.get("/documents", async (req, res) => {
  try {
    const {
      since = "2026-01-01",
      until = "2026-01-31",
      per_page = String(ENV.PER_PAGE_DEFAULT),
      page = "1",
      type = "FS",
    } = req.query as Record<string, string>;

    const data = await vendusGet(
      `/documents/?since=${since}&until=${until}&per_page=${per_page}&page=${page}&type=${type}`
    );

    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

documentsRoutes.get("/documents/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const data = await vendusGet(`/documents/${id}/`);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

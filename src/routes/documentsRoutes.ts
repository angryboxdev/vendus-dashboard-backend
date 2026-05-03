import { ENV } from "../config/env.js";
import { Router } from "express";
import { vendusGet } from "../infra/vendusClient.js";
import { detectChannel } from "../domain/channelDetection.js";
import { loadProductCatalog } from "../infra/vendusProductsCatalog.js";
import { getCategoryFromCatalog } from "../domain/priceMap.js";
import type { VendusDetailedDocument } from "../domain/types.js";

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
    const data = await vendusGet<VendusDetailedDocument>(`/documents/${id}/`);
    await loadProductCatalog();
    const channel = detectChannel(data);
    const has_drinks = (data.items ?? []).some((item) => {
      const cat = getCategoryFromCatalog(item);
      return cat === "bebida_alcoolica" || cat === "bebida_nao_alcoolica";
    });
    res.json({ ...data, channel, has_drinks });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

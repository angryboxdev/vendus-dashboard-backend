import { Router } from "express";
import { ACCESS_CATALOG } from "../../domain/catalog.js";

/**
 * `GET /api/me/access` — o acesso efetivo do próprio utilizador, para o
 * frontend adaptar menus e botões (o backend continua a decidir cada
 * pedido). Inclui o catálogo para os rótulos.
 */
export function createAccessMeRouter(): Router {
  const router = Router();
  router.get("/me/access", (req, res) => {
    const a = req.access!;
    res.json({
      profile: a.profile,
      isAdmin: a.isAdmin,
      portalOnly: a.portalOnly,
      permissions: a.permissions,
      modules: a.modules,
      catalog: ACCESS_CATALOG,
    });
  });
  return router;
}

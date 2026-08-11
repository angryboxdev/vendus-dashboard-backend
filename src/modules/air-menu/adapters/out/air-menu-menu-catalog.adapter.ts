import type { MenuCatalogPort } from "../../domain/ports/out/menu-catalog.port.js";
import type { AirMenuGatewayPort, RawMenuNode } from "../../domain/ports/out/air-menu-gateway.port.js";
import type { SessionManagerService } from "../../domain/services/session-manager.service.js";
import type { AirMenuMenuItem } from "../../domain/entities/air-menu-menu-item.js";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

interface CacheEntry {
  items: Map<string, AirMenuMenuItem>;
  loadedAt: number;
}

/**
 * Nomes de famílias estruturais (wrappers) que não representam categorias
 * de negócio. Ao encontrá-las, a categoria activa NÃO é actualizada.
 */
const STRUCTURAL_FAMILY_NAMES = new Set(["Menu"]);

/**
 * Mapeamento de família AirMenu → categoria pai de negócio.
 * Classics, Salties, Specials e Sweeties são sub-categorias de "Pizzas".
 * Famílias sem entrada mapeiam para si próprias (ex: "Drinks" → "Drinks").
 */
const CATEGORY_PARENT_MAP: Record<string, string> = {
  Classics: "Pizzas",
  Salties: "Pizzas",
  Specials: "Pizzas",
  Sweeties: "Pizzas",
};

/**
 * Percorre a árvore do menu recursivamente.
 * A categoria de um item é a PRIMEIRA família com nome real (não estrutural)
 * encontrada acima dele na hierarquia. Isto garante que sub-famílias dentro de
 * "Salties" (por ex.) não substituem "Salties" como categoria dos itens.
 * O `tax` herda-se da família pai quando não está definido no próprio item,
 * tal como acontece em menus onde o IVA é configurado ao nível da família.
 * Apenas itens com menuRelation "item" e PLU preenchido são indexados.
 */
function walkMenu(
  nodes: RawMenuNode[],
  activeCategory: string,
  activeTax: number,
  result: Map<string, AirMenuMenuItem>,
): void {
  for (const node of nodes) {
    if (node.menuRelation === "family") {
      const nextCategory =
        node.title && !STRUCTURAL_FAMILY_NAMES.has(node.title)
          ? node.title
          : activeCategory;
      const nextTax = node.tax != null ? node.tax : activeTax;
      walkMenu(node.childs ?? [], nextCategory, nextTax, result);
    } else if (node.menuRelation === "item" && node.plu) {
      const effectiveTax = node.tax != null ? node.tax : activeTax;
      result.set(node.plu, {
        plu: node.plu,
        title: node.title,
        category: activeCategory,
        parentCategory: CATEGORY_PARENT_MAP[activeCategory] ?? activeCategory,
        vatRate: effectiveTax / 100,
      });
    }
  }
}

/**
 * Adapter que carrega o catálogo de menu da API AirMenu e guarda em cache por
 * 1 hora. Na primeira chamada para cada enterprise, descobre os divisionIds
 * disponíveis e usa o primeiro para obter o menu.
 */
export class AirMenuMenuCatalogAdapter implements MenuCatalogPort {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly gateway: AirMenuGatewayPort,
    private readonly sessionManager: SessionManagerService,
  ) {}

  async getMenuItems(enterpriseId: string): Promise<Map<string, AirMenuMenuItem>> {
    const cached = this.cache.get(enterpriseId);
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
      return cached.items;
    }

    const session = await this.sessionManager.getValidSession();

    // O catálogo de menu vive na enterprise "Angry Box - Menu" (1783676282104).
    // Com divisionId vazio, a API devolve o menu completo partilhado por todas
    // as enterprises. Não depende da enterpriseId do pedido de analytics.
    const menuEnterpriseId = "1783676282104";
    const menuDivisionId = "";
    const menuNodes = await this.gateway.getMenu(session.sessionId, menuEnterpriseId, menuDivisionId);

    const items = new Map<string, AirMenuMenuItem>();
    walkMenu(menuNodes, "Outros", 0, items);

    this.cache.set(enterpriseId, { items, loadedAt: Date.now() });
    console.log(`[AirMenu] Catálogo carregado: ${items.size} itens (enterprise ${enterpriseId})`);

    return items;
  }
}

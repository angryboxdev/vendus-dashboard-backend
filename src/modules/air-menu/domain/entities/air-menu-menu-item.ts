export interface AirMenuMenuItem {
  plu: string;
  title: string;
  /** Nome da família AirMenu (sub-categoria), ex: "Salties", "Bebidas". */
  category: string;
  /** Categoria de negócio (pode agrupar várias famílias), ex: "Pizzas". */
  parentCategory: string;
  /** Taxa de IVA como fracção: 0.13, 0.23, 0. */
  vatRate: number;
}

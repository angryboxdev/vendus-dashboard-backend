export type CustosVariaveisItem = {
  id: string;
  descricao: string;
  valor: number;
  valorSemIva: number;
  observacao: string;
};

export type CustosVariaveisPayload = {
  producao: CustosVariaveisItem[];
  venda: CustosVariaveisItem[];
};

export type DRE_CategoriaCustosVariaveis = "producao" | "venda";

export type CustosVariaveisItemBody = {
  descricao: string;
  valor: number;
  valorSemIva: number;
  observacao: string;
};

export type CustosVariaveisCreateBody = CustosVariaveisItemBody & {
  section: DRE_CategoriaCustosVariaveis;
};

export type CustosVariaveisUpdateBody = CustosVariaveisItemBody & {
  id?: string;
};

/**
 * Regras de palavras-chave para propor a subcategoria de uma linha (código do
 * catálogo predefinido). Conservadoras: só termos inequívocos; a primeira regra
 * que bate ganha, por isso as mais específicas vêm primeiro (ex.: «PILHA ALCALINA»
 * antes de «ALCALINA» das águas). Sem correspondência → histórico/IA/revisão.
 * Aplicam-se à descrição normalizada (maiúsculas, sem acentos, pontuação → espaço).
 */
export interface KeywordRule {
  categoryCode: string;
  label: string;
  pattern: RegExp;
}

export const KEYWORD_RULES: KeywordRule[] = [
  { categoryCode: "FDR.05", label: "depósito/caução", pattern: /\b(DEPOSITO|VASILHAME|TARA RETORNAVEL)\b/ },
  { categoryCode: "OPD.09", label: "consumível (pilhas, etiquetas, gás)", pattern: /\b(PILHAS?|BATERIAS?|ETIQUETAS?|ETIQ|\d*ETI\d+X\d+|ROLOS? TERMIC\w*|PAPEL TERMIC\w*|R TERM|ROLOS? TERM|GAS MACARICO|ISQUEIROS?|FOSFOROS|LAMPADAS?|FITA ADESIVA)\b/ },
  { categoryCode: "OPD.08", label: "limpeza e higiene", pattern: /\b(LIXIVIA|DETERG\w*|LOICA|DESINF\w*|LIMPA|LIMPEZA|LAVA ?TUDO|TIRA GORDURAS|DESENGORD\w*|DESENTUP\w*|DESTOP|SACOS? (DO )?LIXO|LIXO|MULTIUSOS|PAPEL HIGIENICO|ESFREG\w*|ESPONJAS?|MR ?PROPER|CIF|SONASOL|FAIRY|SABONETE|GEL (DE )?MAOS|ALCOOL GEL|LUVAS?|TOALHAS? (DE )?MAOS?|TOAL MAO|AMBIENTADOR|GLADE)\b/ },
  { categoryCode: "OPD.03", label: "embalagens e descartáveis", pattern: /\b(GDP|GUARDANAPOS?|COPOS?|PALHINHAS?|SACOS? (DE )?PASTELARIA|SACOS? KRAFT|CAIXAS? (DE )?PIZZA|EMBALAG\w*|PELICULA|PELIC ADERENTE|FILME ADERENTE|SACOS? (SAIDA|SUSTENTAVEL|ISOTERMICO|PAPEL|PLASTICO|PASTEL\w*)|PRATOS? DESCART\w*|TALHERES? DESCART\w*|DESCARTAVE\w*|FORMAS? ALU\w*)\b/ },
  { categoryCode: "EST.07", label: "utensílios e pequeno equipamento", pattern: /\b(TERMOMETRO|PULVERIZADOR|VILEDA|CAIXA SMART STORE|FACAS?|TABUAS?|CESTOS?|PANELAS?|FRIGIDEIRAS?|ESPATULAS?|PINCAS?|CONCHAS?|COLHER\w*|CONTAINER INOX|GN ?\d\/\d+)\b/ },
  { categoryCode: "OPD.02", label: "bebidas", pattern: /\b(CERV\w*|COCA COLA|PEPSI|SUMOS?|NECTAR|AGUAS?|AG ALCALINA|VINHOS?|ESPUMANTE|GIN|VODKA|WHISKY|RUM|LICOR|ICE TEA|TONICA|SCHWEPPES|SUPER BOCK|SAGRES|RED BULL|MONSTER|CORONITA|SPRITE|FANTA|7 ?UP|GUARANA|ICE T|TEQUILA|TEQ|COCKTAIL|SMIRNOFF|SIDRA|NECT|COMPAL|PEDRAS)\b/ },
  { categoryCode: "OPD.01", label: "ingredientes", pattern: /\b(QJ|QUEIJOS?|FARINHA|SEMOLA|TOMATE|MANTEIGA|NATAS?|IOG\w*|LEITE|OVOS?|COG|COGUMELOS?|FRANGO|FRAN|CARNE|PEPPERONI|PRESUNTO|FIAMBRE|BACON|CAMARAO|CAM|AZEITE|OLEO|AZEIT|AZEITONAS?|ACUCAR|MEL|ALHO|CEBOLA|SALSA|MANJERICAO|RUCULA|ALFACE|ACELGA|MILHO|PAO|BECHAMEL|MOLHOS?|AVELA|NUTELA|NUTELLA|CHOCOLATE|PINHAO|BANANA|GYOZAS?|HAMB\w*|MASSA|ARROZ|BATATAS?|PIMENTA|OREGAOS|MOZZARELLA|PARMESAO|FIAMBRE|CHOURICO|ATUM|SALMAO|PACOQUITA|AMARANTH|SAL|FLOR DE SAL|TOMILHO|MAIONESE|KETCHUP|MOSTARDA|ANANAS|LARANJA|PIRI ?PIRI|POJADOURO|SALSICHAS?|BOV\w*|PORCO|VITELA|BOLACHAS?|OREO|MANT|BASE PIZZA|FERMENTO|VINAGRE|CANELA|BAUNILHA)\b/ },
];

/** Maiúsculas, sem acentos; pontuação e «#» viram espaço (ex.: «AG.ALCALINA» → «AG ALCALINA»). */
export function normalizeDescription(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

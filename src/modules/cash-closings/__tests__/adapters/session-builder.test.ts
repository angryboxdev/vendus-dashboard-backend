import {
  buildSessions,
  type VendusRegisterMovement,
  type DocEntry,
} from "../../adapters/out/session-builder.js";

// ---------- helpers ----------

function mov(
  operation: string,
  time: string,
  amount: string,
  document_id = 0,
): VendusRegisterMovement {
  return { operation, type: "NU", amount, obs: null, document_id, user_id: 1, date: "2026-06-14", time };
}

function makeDocMap(entries: Array<[number, DocEntry]>): Map<number, DocEntry> {
  return new Map(entries);
}

// ---------- testes ----------

describe("buildSessions — lógica base", () => {
  it("devolve lista vazia quando não há movimentos", () => {
    expect(buildSessions([], new Map())).toHaveLength(0);
  });

  it("constrói uma sessão completa (open → close)", () => {
    const movements = [
      mov("open",  "11:00:00", "0"),
      mov("in",    "11:30:00", "50.00", 101),
      mov("in",    "12:00:00", "30.00", 102),
      mov("close", "16:00:00", "0"),
    ];
    const docMap = makeDocMap([
      [101, { type: "FS", amount: 50 }],
      [102, { type: "FT", amount: 30 }],
    ]);
    const result = buildSessions(movements, docMap);

    expect(result).toHaveLength(1);
    expect(result[0]?.openedAt).toBe("2026-06-14T11:00:00");
    expect(result[0]?.closedAt).toBe("2026-06-14T16:00:00");
    expect(result[0]?.total).toBe(80);
  });

  it("sessão ainda aberta (sem close) fica com closedAt=null", () => {
    const movements = [
      mov("open", "11:00:00", "0"),
      mov("in",   "11:30:00", "100.00", 101),
    ];
    const docMap = makeDocMap([[101, { type: "FS", amount: 100 }]]);
    const result = buildSessions(movements, docMap);

    expect(result).toHaveLength(1);
    expect(result[0]?.closedAt).toBeNull();
    expect(result[0]?.total).toBe(100);
  });

  it("constrói duas sessões num mesmo dia (multi-turno)", () => {
    const movements = [
      mov("open",  "11:00:00", "0"),
      mov("in",    "11:30:00", "162.37", 101),
      mov("close", "16:00:00", "0"),
      mov("open",  "16:01:00", "0"),
      mov("in",    "17:00:00", "679.13", 102),
      mov("close", "22:00:00", "0"),
    ];
    const docMap = makeDocMap([
      [101, { type: "FS", amount: 162.37 }],
      [102, { type: "FT", amount: 679.13 }],
    ]);
    const result = buildSessions(movements, docMap);

    expect(result).toHaveLength(2);
    expect(result[0]?.total).toBe(162.37);
    expect(result[1]?.total).toBe(679.13);
  });
});

describe("buildSessions — desconto de NCs", () => {
  it("subtrai NC quando aparece como movimento 'out' com document_id", () => {
    const movements = [
      mov("open",  "11:00:00", "0"),
      mov("in",    "11:30:00", "676.52", 101),
      mov("out",   "13:00:00", "32.30",  201),  // NC como "out"
      mov("close", "22:00:00", "0"),
    ];
    const docMap = makeDocMap([
      [101, { type: "FS", amount: 676.52 }],
      [201, { type: "NC", amount: 32.30  }],
    ]);
    const result = buildSessions(movements, docMap);

    expect(result[0]?.total).toBe(644.22);
  });

  it("subtrai NC quando o movimento 'out' tem doc_id+1 (quirk do Vendus)", () => {
    // O Vendus devolve o id do documento NC + 1 no campo document_id do movimento
    const movements = [
      mov("open",  "11:00:00", "0"),
      mov("in",    "11:30:00", "100.00", 101),
      mov("out",   "12:00:00", "-32.80", 202),  // doc_id=202, mas a NC real é 201
      mov("close", "16:00:00", "0"),
    ];
    const docMap = makeDocMap([
      [101, { type: "FS", amount: 100   }],
      [201, { type: "NC", amount: 32.80 }],  // id real = 202-1
    ]);
    const result = buildSessions(movements, docMap);

    expect(result[0]?.total).toBe(67.20);  // 100 - 32.80
  });

  it("subtrai NC quando o movimento 'out' tem doc_id+2 (quirk do Vendus — variante +2)", () => {
    // Casos reais onde o Vendus devolve doc_id+2 em vez de doc_id+1
    const movements = [
      mov("open",  "11:00:00", "0"),
      mov("in",    "11:30:00", "100.00", 101),
      mov("out",   "12:00:00", "-32.80", 203),  // doc_id=203, mas a NC real é 201
      mov("close", "16:00:00", "0"),
    ];
    const docMap = makeDocMap([
      [101, { type: "FS", amount: 100   }],
      [201, { type: "NC", amount: 32.80 }],  // id real = 203-2
    ]);
    const result = buildSessions(movements, docMap);

    expect(result[0]?.total).toBe(67.20);  // 100 - 32.80
  });

  it("Vendus off-by-one: NC é descontada da sessão correcta, não da última", () => {
    // Reproduz o bug real: sessão de teste + sessão real, NC com doc_id+1 no movimento
    // Antes do fix: a NC ficava "não mapeada" e era atribuída à última sessão
    const movements = [
      mov("open",  "00:39:33", "0"),
      mov("in",    "00:41:44", "16.40", 1001),
      mov("in",    "00:42:00", "16.40", 1002),
      mov("out",   "00:45:03", "-16.40", 1004),  // NC real é 1003 (doc_id+1)
      mov("out",   "00:45:16", "-16.40", 1006),  // NC real é 1005 (doc_id+1)
      mov("close", "00:45:47", "0"),
      mov("open",  "10:57:06", "0"),
      mov("in",    "11:00:00", "945.29", 2001),
      // sem close (sessão ainda aberta)
    ];
    const docMap = makeDocMap([
      [1001, { type: "FS", amount: 16.40 }],
      [1002, { type: "FS", amount: 16.40 }],
      [1003, { type: "NC", amount: 16.40 }],  // movement tem 1004
      [1005, { type: "NC", amount: 16.40 }],  // movement tem 1006
      [2001, { type: "FS", amount: 945.29 }],
    ]);
    const result = buildSessions(movements, docMap);

    expect(result).toHaveLength(2);
    expect(result[0]?.total).toBe(0);       // sessão de teste: 32.80 - 16.40 - 16.40
    expect(result[1]?.total).toBe(945.29);  // sessão real: intacta
  });

  it("subtrai NC sem movimento quando há uma única sessão no dia", () => {
    // Caso mais comum: NC de cartão não gera movimento na caixa
    const movements = [
      mov("open",  "11:00:00", "0"),
      mov("in",    "11:30:00", "676.52", 101),
      mov("close", "22:00:00", "0"),
    ];
    const docMap = makeDocMap([
      [101, { type: "FS", amount: 676.52 }],
      [201, { type: "NC", amount: 32.30  }],  // sem movimento correspondente
    ]);
    const result = buildSessions(movements, docMap);

    expect(result[0]?.total).toBe(644.22);
  });

  it("atribui NC sem movimento à última sessão em dias multi-turno", () => {
    const movements = [
      mov("open",  "11:00:00", "0"),
      mov("in",    "11:30:00", "162.37", 101),
      mov("close", "16:00:00", "0"),
      mov("open",  "16:01:00", "0"),
      mov("in",    "17:00:00", "679.13", 102),
      mov("close", "22:00:00", "0"),
    ];
    const docMap = makeDocMap([
      [101, { type: "FS", amount: 162.37 }],
      [102, { type: "FT", amount: 679.13 }],
      [201, { type: "NC", amount: 32.30  }],  // sem movimento
    ]);
    const result = buildSessions(movements, docMap);

    expect(result[0]?.total).toBe(162.37);           // sessão 1: intacta
    expect(result[1]?.total).toBe(646.83);            // sessão 2: 679.13 - 32.30
  });

  it("NC via 'out' é atribuída à sessão correcta em multi-turno", () => {
    const movements = [
      mov("open",  "11:00:00", "0"),
      mov("in",    "11:30:00", "100.00", 101),
      mov("out",   "12:00:00", "20.00",  201),  // NC na sessão 1
      mov("close", "16:00:00", "0"),
      mov("open",  "16:01:00", "0"),
      mov("in",    "17:00:00", "50.00",  102),
      mov("close", "22:00:00", "0"),
    ];
    const docMap = makeDocMap([
      [101, { type: "FS", amount: 100 }],
      [102, { type: "FT", amount: 50  }],
      [201, { type: "NC", amount: 20  }],
    ]);
    const result = buildSessions(movements, docMap);

    expect(result[0]?.total).toBe(80);   // 100 - 20
    expect(result[1]?.total).toBe(50);   // sem NC
  });

  it("movimento 'out' sem document_id (sangria) NÃO é deduzido do total", () => {
    const movements = [
      mov("open",  "11:00:00", "0"),
      mov("in",    "11:30:00", "200.00", 101),
      mov("out",   "14:00:00", "80.00",  0),   // sangria — document_id=0
      mov("close", "22:00:00", "0"),
    ];
    const docMap = makeDocMap([[101, { type: "FS", amount: 200 }]]);
    const result = buildSessions(movements, docMap);

    expect(result[0]?.total).toBe(200);  // sangria não reduz o total de vendas
  });

  it("movimento 'out' com document_id que não é NC (ex: sangria com doc) NÃO é deduzido", () => {
    const movements = [
      mov("open",  "11:00:00", "0"),
      mov("in",    "11:30:00", "200.00", 101),
      mov("out",   "14:00:00", "50.00",  301),  // doc que não é NC
      mov("close", "22:00:00", "0"),
    ];
    const docMap = makeDocMap([
      [101, { type: "FS", amount: 200 }],
      [301, { type: "FS", amount: 50  }],  // é FS, não NC
    ]);
    const result = buildSessions(movements, docMap);

    expect(result[0]?.total).toBe(200);
  });

  it("múltiplas NCs sem movimento são todas subtraídas da sessão única", () => {
    const movements = [
      mov("open",  "11:00:00", "0"),
      mov("in",    "11:30:00", "500.00", 101),
      mov("close", "22:00:00", "0"),
    ];
    const docMap = makeDocMap([
      [101, { type: "FS", amount: 500   }],
      [201, { type: "NC", amount: 20    }],
      [202, { type: "NC", amount: 12.30 }],
    ]);
    const result = buildSessions(movements, docMap);

    expect(result[0]?.total).toBe(467.70);  // 500 - 20 - 12.30
  });

  it("resultado sem NCs é idêntico à soma directa dos movimentos 'in'", () => {
    const movements = [
      mov("open",  "11:00:00", "0"),
      mov("in",    "11:30:00", "100.00", 101),
      mov("in",    "12:00:00", "50.50",  102),
      mov("close", "22:00:00", "0"),
    ];
    const docMap = makeDocMap([
      [101, { type: "FS", amount: 100  }],
      [102, { type: "FT", amount: 50.5 }],
    ]);
    const result = buildSessions(movements, docMap);

    expect(result[0]?.total).toBe(150.50);
  });
});

describe("buildSessions — sessão cross-day (aberta no dia anterior)", () => {
  it("NCs com 'out' antes do primeiro 'open' não são debitadas na sessão actual", () => {
    // Reproduz o bug real de 2026-08-13:
    // - Sessão 1 abriu no dia anterior; os seus movimentos (in + out de NCs) e o
    //   close aparecem antes do open da sessão 2 nos dados do dia corrente.
    // - Todas as vendas da sessão 1 foram anuladas (NCs) → net = 0.
    // - Sessão 2 fez €172,52 sem nenhuma NC.
    // Bug anterior: as NCs da sessão 1 ficavam "sem dono" e eram debitadas da
    // sessão 2, produzindo 172.52 − 96.42 = 76.10 em vez de 172.52.
    //
    // NC ids: 1001, 1003, 1006, 1009, 1011 (separados dos FS/FT: 2001-2005, 3001-3008)
    // Out doc_ids: 1002 (+1), 1005 (+2), 1008 (+2), 1010 (+1), 1012 (+1)
    const movements = [
      // Sessão 1 (cross-day): vendas
      mov("in",    "18:03:31", "36.90",  2001),
      mov("in",    "18:05:27", "11.90",  2002),
      mov("in",    "18:15:06", "9.90",   2003),
      mov("in",    "18:34:25", "1.00",   2004),
      mov("in",    "19:12:55", "36.72",  2005),
      // Sessão 1: NCs (doc_id+1 e doc_id+2 — variantes reais do Vendus)
      mov("out",   "19:35:44", "-36.72", 1002),  // NC 1001 (doc_id+1)
      mov("out",   "19:36:13", "-36.90", 1005),  // NC 1003 (doc_id+2)
      mov("out",   "19:36:35", "-11.90", 1008),  // NC 1006 (doc_id+2)
      mov("out",   "19:36:57", "-9.90",  1010),  // NC 1009 (doc_id+1)
      mov("out",   "19:37:11", "-1.00",  1012),  // NC 1011 (doc_id+1)
      // Sessão 1: close
      mov("close", "19:38:08", "0"),
      // Sessão 2: open e vendas
      mov("open",  "19:38:26", "100.00"),
      mov("in",    "19:40:55", "14.40",  3001),
      mov("in",    "19:41:40", "36.72",  3002),
      mov("in",    "19:41:53", "1.00",   3003),
      mov("in",    "19:42:16", "9.90",   3004),
      mov("in",    "19:42:55", "36.90",  3005),
      mov("in",    "19:45:19", "11.90",  3006),
      mov("in",    "21:06:03", "48.80",  3007),
      mov("in",    "22:11:31", "12.90",  3008),
    ];
    const docMap = makeDocMap([
      // Documentos da sessão 1
      [2001, { type: "FS", amount: 36.90 }],
      [2002, { type: "FS", amount: 11.90 }],
      [2003, { type: "FS", amount: 9.90  }],
      [2004, { type: "FS", amount: 1.00  }],
      [2005, { type: "FT", amount: 36.72 }],
      [1001, { type: "NC", amount: 36.72 }],  // out tem 1002 (doc_id+1)
      [1003, { type: "NC", amount: 36.90 }],  // out tem 1005 (doc_id+2)
      [1006, { type: "NC", amount: 11.90 }],  // out tem 1008 (doc_id+2)
      [1009, { type: "NC", amount: 9.90  }],  // out tem 1010 (doc_id+1)
      [1011, { type: "NC", amount: 1.00  }],  // out tem 1012 (doc_id+1)
      // Documentos da sessão 2
      [3001, { type: "FS", amount: 14.40 }],
      [3002, { type: "FS", amount: 36.72 }],
      [3003, { type: "FS", amount: 1.00  }],
      [3004, { type: "FS", amount: 9.90  }],
      [3005, { type: "FS", amount: 36.90 }],
      [3006, { type: "FS", amount: 11.90 }],
      [3007, { type: "FS", amount: 48.80 }],
      [3008, { type: "FS", amount: 12.90 }],
    ]);
    const result = buildSessions(movements, docMap);

    expect(result).toHaveLength(1);
    expect(result[0]?.openedAt).toBe("2026-06-14T19:38:26");
    expect(result[0]?.total).toBe(172.52);  // sessão 2 intacta, NCs cross-day não debitadas
  });

  it("NC sem qualquer movement (ex: cartão) continua a ser debitada no fallback", () => {
    // Garante que o fix não quebra o caso legítimo de NCs sem movement
    const movements = [
      mov("open",  "11:00:00", "0"),
      mov("in",    "11:30:00", "100.00", 101),
      mov("close", "22:00:00", "0"),
    ];
    const docMap = makeDocMap([
      [101, { type: "FS", amount: 100  }],
      [201, { type: "NC", amount: 20   }],  // sem qualquer "out" movement → deve ser debitada
    ]);
    const result = buildSessions(movements, docMap);

    expect(result[0]?.total).toBe(80);  // 100 - 20
  });
});

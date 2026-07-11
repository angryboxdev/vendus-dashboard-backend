import {
  buildSessions,
  type VendusMovement,
  type DocEntry,
} from "../../adapters/out/session-builder.js";

// ---------- helpers ----------

function mov(
  operation: string,
  time: string,
  amount: string,
  document_id = 0,
): VendusMovement {
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

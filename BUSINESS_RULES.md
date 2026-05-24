# Regras de Negócio — Vendus Dashboard

Documentação central das regras e convenções do negócio. Atualizar sempre que uma regra for clarificada ou alterada.

---

## Índice

1. [Documentos Vendus — Tipos e Cancelamentos](#1-documentos-vendus--tipos-e-cancelamentos)

---

## 1. Documentos Vendus — Tipos e Cancelamentos

### Tipos de documento relevantes

| Tipo | Nome          | Descrição                                                                 |
|------|---------------|---------------------------------------------------------------------------|
| `FS` | Nota de venda | Documento de venda emitido no POS (mesa, balcão). Forma mais comum.       |
| `FT` | Fatura        | Documento de venda com dados de cliente (NIF). Fiscalmente equivalente a FS. |
| `NC` | Nota de crédito | Anula total ou parcialmente uma FS ou FT anterior.                      |

**Regra:** Todas as consultas ao Vendus que buscam documentos de venda devem incluir `FS`, `FT` **e** `NC`. O parâmetro da API é `type=FS,FT,NC`.

> Antes de maio de 2026 o sistema registava apenas FS. A partir daí passou a emitir também FT (faturas com NIF do cliente). Ambos os tipos representam vendas e devem ser tratados de forma idêntica em todos os cálculos.

### Como as NC cancelam documentos

As NC não têm valor negativo na listagem base — chegam com `amount_gross` **positivo**. O desconto tem de ser aplicado manualmente:

1. Buscar todos os documentos do período (`FS`, `FT`, `NC`).
2. Para cada `NC`, obter o detalhe via `GET /documents/{id}/` e ler o campo `related_docs`.
3. Os `related_docs` com `type === "FS"` ou `type === "FT"` indicam os documentos que a NC cancela — guardar os seus `number`.
4. Excluir da lista de vendas todos os `FS`/`FT` cujo `number` esteja nessa lista de cancelados.
5. Calcular totais **apenas** com os `FS`/`FT` não cancelados.

**Alternativa usada no analytics** (sem fetch de detalhe): somar `FS + FT`, subtrair `NC`.
Fórmula: `sum(FS) + sum(FT) - sum(NC)` — funciona porque o `amount_gross` das NC já vem positivo no endpoint de lista.

```
// Implementação em analyticsDashboardService.ts
function sumGrossCents(docs: VendusDocument[]): number {
  return docs.reduce((acc, d) => {
    const c = toCents(d.amount_gross);
    return d.type === "NC" ? acc - c : acc + c;
  }, 0);
}
```

### Ficheiros afetados

Todos os serviços que consultam documentos Vendus devem usar `"FS,FT,NC"` e tratar FT como FS:

| Ficheiro | Observação |
|----------|------------|
| `src/routes/documentsRoutes.ts` | Default `type=FS,FT` (sem NC, é endpoint de consulta direta) |
| `src/routes/reportsRoutes.ts` | Default `type=FS,FT,NC` |
| `src/services/monthlySummaryService.ts` | Exclui FS/FT cancelados por NC via `related_docs` |
| `src/services/cashClosingService.ts` | Idem — calcula total Vendus do dia |
| `src/services/analyticsDashboardService.ts` | Usa fórmula subtração NC (sem fetch de detalhe) |
| `src/services/consumableConsumptionService.ts` | Exclui FS/FT cancelados por NC |
| `src/services/ingredientConsumptionService.ts` | Delega em `buildMonthlySummary` |
| `src/services/dreReceitaBrutaService.ts` | Delega em `buildMonthlySummary` |
| `src/services/dreKpisService.ts` | Delega em `buildMonthlySummary` |

---

<!-- Adicionar novas secções abaixo seguindo o mesmo formato -->

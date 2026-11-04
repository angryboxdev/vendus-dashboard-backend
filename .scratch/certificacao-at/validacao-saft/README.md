# Validação do SAF-T gerado contra o XSD oficial (1.04_01)

O XSD oficial (`src/modules/invoicing/__tests__/fixtures/at/SAFTPT1.04_01.xsd`) é **XSD 1.1**
(`xs:assert`, `xs:all` com repetições), que nem o .NET nem o JDK validam.

## Validação estrutural local (Windows, sem dependências)
`validar-saft.ps1` converte uma cópia para XSD 1.0: retira os 19 `xs:assert` (as regras deles —
menção/código de isenção só e sempre a 0 %, TaxBase — estão cobertas em `saft.test.ts`) e troca
`xs:all` por `xs:sequence` (mais exigente: obriga à ordem documentada).

```powershell
# o teste do gerador escreve src/modules/invoicing/__tests__/fixtures/saft-gerado.test-output.xml
powershell -File validar-saft.ps1 -Xsd <...>\SAFTPT1.04_01.xsd -Xml <...>\saft-gerado.test-output.xml
```

Resultado em 2026-11-04: **SAF-T do Mezza — 0 erros**. O SAF-T de demonstração da AT dá 45 erros,
todos artefactos da conversão na secção de contabilidade (`Lines` com `DebitLine`/`CreditLine`, que
no original é `xs:all` sem ordem e que a faturação não usa) — confirma que a cópia valida bem o resto.

## Validação completa (XSD 1.1) — pendente
Precisa de um validador XSD 1.1 (ex.: Apache Xerces-J 2.12.2 «xml-schema-1.1», `jaxp.SourceValidator -xsd11`)
ou do validador da AT (`validador_v1_04.exe`). A execução do Xerces descarregado foi bloqueada nesta
sessão (código externo) — correr com autorização do utilizador antes do pedido de certificação.

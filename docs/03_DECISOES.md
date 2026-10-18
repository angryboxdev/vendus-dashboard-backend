# Decisões aprovadas

Decisões arquiteturais completas: `docs/adr/` (0001–0039). Este ficheiro resume o que condiciona trabalho futuro e regista decisões que não têm ADR. Em conflito, vale a decisão mais recente.

## Processo (definido pelo utilizador)
- **Merge de PR, migrações e deploy em produção exigem aprovação explícita de cada vez**; uma aprovação não se estende à seguinte. Commits só onde o utilizador autorizou (ex.: dentro de uma fase autorizada da task); push só quando pedido.
- Tasks faseadas: executar **uma fase de cada vez**, apresentar resultados/testes e **aguardar autorização antes da fase seguinte**. Dentro de uma fase autorizada, seguir as opções recomendadas sem perguntar, testar e validar antes de cada commit.
- Antes de aplicar migrações/deploy: verificar a segurança (cadeia completa em PGlite, rollback, colunas dos adapters, builds, CI) — integrar backend primeiro, confirmar `/api/health`, depois frontend.
- Respostas em português de Portugal; RGPD: dados de teste fictícios, nunca dados pessoais reais em docs/testes.
- Nunca guardar ou aceitar credenciais no chat; chaves só no Render / `.env` local.

## Plataforma (ADRs principais)
- Produto vertical de restauração; integrações são o único eixo de plugins (0001). Location é tabela de primeira classe e input de escrita, não fronteira de isolamento (0002, 0009).
- `org_id` em todas as tabelas; scoped query helper é a única forma de construir queries; RLS é rede adicional (0005, 0007, 0008, 0020).
- Ecrãs sem utilizador (kiosk, caixa, KDS) usam Location Tokens (0010). Segredos de integração cifrados na aplicação (0014).
- Convenções HTTP para endpoints novos: RFC 7807, `Idempotency-Key`, ETag/If-Match, correlation id (0022). pt-PT agora, es-ES depois (0023). Alojamento na UE (0019).

## Novo RH (ADR-0018 a 0038)
- Evolui o Mezza ERP (não é produto novo); reutiliza `hr_employees` (0018, 0025). Ledgers append-only para ausências e banco de horas (0028, 0029); escalas com versões publicadas (0030); fecho de período com dupla aprovação (0031); organização de demonstração na mesma BD (0034).
- O «RH antigo» mantém-se acessível no menu (pedido do utilizador).
- Assistente Mezza: a IA interpreta, o backend valida e executa (0038). Fornecedor OpenAI ou Gemini escolhido por variável de ambiente. Guardrails/quotas adiados (ramo `assistente-guardrails`).
- Pendentes: decisões D0–D12 (`docs/relatorios/novo-rh-resumo-final.md`); modelo cliente/obra é só proposta (0032).

## Financeiro/Stock v1.2 (task em `.scratch/financeiro-stock-v1-2/`)
Contrato: uma fatura = documento original (identidade, linhas, valores) + classificação financeira + tratamento de Stock, em camadas separadas. «Enviar para Stock» cria revisão, nunca inventário automático. Não criar pedidos, receções, ativos fixos nem nova contabilidade.

**F1 (em produção):**
- D1–D3 Identidade fiscal em `fiscal_document_identities` (única por org + comprador + país/NIF + tipo + série/número normalizado; texto original preservado; nunca inventar NIF) — ADR-0039.
- D4 Motor único de valores (cêntimos inteiros, decimais exatos) no servidor, espelhado no frontend. Finalizar só com diferença 0,00 €; ajuste de arredondamento ≤ 1 cêntimo por taxa de IVA com motivo; taxa de IVA em falta nunca é 0%.
- D5 Uma obrigação ativa por fatura (índice único só se não houver duplicados históricos).
- D6 Versão com 409, auditoria, `Idempotency-Key` opcional.
- D7 Importação do Stock usa a mesma identidade; substituir importação confirmada deixou de ser possível.

**F2 (ramo `financeiro`, por integrar):**
- Política do fornecedor ganha «Decidir no documento»; exceções por loja prevalecem; sugestão de envio: exceção da loja → fornecedor → categoria → sem sinal. «Decidir» sem escolha recusa; desmarcar contra a predefinição exige motivo; sem sinal mantém «automático».
- Modos reutilizam `line_detail_mode` (simple/detailed/by_values). Linhas reais guardadas em todos os modos; o feed de análise usa só «Por artigo» para não alterar relatórios existentes; «Por valores» em `invoice_allocations` (soma = base líquida, sem redistribuir em silêncio). Trocar de modo não apaga nada.
- «Total a pagar | Em atraso» calculado no backend sobre o saldo aberto (total − alocações bancárias), atraso pela data civil no fuso da organização; NC aplicadas não se subtraem duas vezes; duplicados suspeitos mantêm o saldo com aviso.

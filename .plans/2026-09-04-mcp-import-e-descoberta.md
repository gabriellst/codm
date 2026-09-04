# Import e descoberta de servidores MCP — Implementation Plan

O dono já tem servidores MCP configurados: no Claude Code, no Claude Desktop, num `.mcp.json` de
repositório. Hoje o console o obriga a redigitar tudo num formulário e a descobrir só depois se
funcionou. Este plano fecha as duas pontas — **importar o que já existe** e **provar a conexão antes
de salvar** — e deixa duas melhorias menores encostadas.

Decisões do founder (04/09/2026):

- **Fontes:** as quatro — colar JSON, `.mcp.json` do workspace anexado, `~/.claude.json` do Claude
  Code, e o `claude_desktop_config.json` do Claude Desktop.
- **Segredos:** importa **só as chaves, com valor vazio**, e bloqueia o salvar até o dono repreencher.
  É o mesmo comportamento que o PR #56 construiu para reconfigurar (`hasBlankSecret`), então o fluxo
  fica consistente e nenhum segredo é copiado por um caminho que o dono não viu.

---

## Medições que sustentam este plano

Tudo abaixo foi medido nesta máquina em 04/09/2026, não suposto.

**1. `~/.claude.json` NÃO tem `mcpServers` no topo.** 91 KB, e a configuração vive em
`projects["<caminho absoluto>"].mcpServers`. Medido: 19 projetos, 1 com servidores. O caminho
absoluto é a chave — e é exatamente o `workspacePath` que a thread já carrega.

**2. Três formas reais, e uma delas não declara o tipo:**

```
supermemory → { command, args }                     ← SEM `type`. Ausência significa stdio.
ruflo       → { type: 'stdio', command, args, env }
github      → { type: 'http', url, headers }
```

O importador **precisa** tratar `type` ausente como STDIO. Um parser que exija o campo descarta o
primeiro servidor da lista real do dono.

**3. Duas formas de documento, não uma:**

| Forma | Onde |
|---|---|
| `{ mcpServers: {...} }` | `.mcp.json`, `claude_desktop_config.json`, JSON colado |
| `{ projects: { "<path>": { mcpServers: {...} } } }` | `~/.claude.json` |

**4. Nesta máquina, três das quatro fontes estão vazias.** Não há `claude_desktop_config.json` em
`AppData/Roaming/Claude`, nem `.mcp.json` no workspace `Desktop\Work`, nem no próprio repo. Só o
`~/.claude.json` tem conteúdo. Consequência para o plano: **os testes não podem depender do disco
desta máquina** — a leitura de arquivo é uma porta, e os casos vivem sobre fixtures.

**5. A chave do MCP é mais restrita que a do mundo.** `MCP_SERVER_KEY_PATTERN` é
`^[a-z][a-z0-9-]{0,31}$`. Os três nomes medidos passam, mas `my_server` e `MyServer` são comuns por
aí e **não** passam. Renomear em silêncio é inaceitável; ou o dono vê o nome proposto, ou a entrada
é rejeitada com motivo.

**6. O nosso contrato tem dois transportes; o mundo tem três.** `McpTransport` é `STDIO | HTTP`.
Configurações com `type: 'sse'` existem. Elas **não** podem sumir caladas.

**7. `reachable` hoje é ambíguo por construção.** `GetSettings` computa
`server.enabled && tools.length > 0`, e `safeListTools` engole a exceção devolvendo lista vazia — o
mesmo sinal cobre "quebrado" e "vazio". O dono vê "não alcançável" sem saber por quê. É isso que o
teste de conexão precisa consertar, não a ausência de teste.

---

## O princípio que organiza o plano

**Rejeição é cidadã de primeira classe.** Um import que descarta o que não entende produz o pior
resultado possível: o dono vê 2 de 3 servidores e conclui que o terceiro não existia. Toda entrada
recusada carrega **motivo nomeado** e chega à tela junto das aceitas.

**A fonte é declarada, nunca inferida.** `McpConfigSource` é um enum de contrato; nenhuma parte do
código decide "é o Claude Desktop" olhando o formato de uma string de caminho (não-negociável nº 5
do CLAUDE.md).

**O parse é puro; o disco é porta.** `parseMcpDocument` recebe texto e devolve candidatos +
rejeições. Nenhum I/O. É o que torna as 7 formas medidas testáveis sem depender de qual máquina roda
a suíte — e o erro de método que este repo já pagou caro duas vezes esta semana (o detector que
mentia no Windows, o teardown que só falhava no POSIX) foi exatamente lógica de plataforma sem
metade pura.

---

## Escopo — e o corte que eu proponho

O founder listou quatro melhorias. Elas **não** cabem num PR só (CLAUDE.md: acima de ~7 entregáveis,
propor a divisão em vez de seguir).

**Este PR (Fase 1) — o import e a prova de conexão:**

- T1 — contrato: `McpConfigSource`, DTOs de candidato e de rejeição
- T2 — o parser puro, com as 7 formas medidas
- T3 — a porta de descoberta e as colunas de DI
- T4 — o BFF: candidatos por fonte
- T5 — o use case de import em lote, segredos só como chave
- T6 — o console: diálogo de import
- T7 — testar conexão antes de salvar, com o erro real
- T8 — e2e

**Fase 2 (PR próprio):** catálogo de presets declarado em contrato, e derivação da chave a partir do
comando. Ambos são polimento em cima da Fase 1 e nenhum dos dois bloqueia o dono hoje.

---

## Task T1: O vocabulário do import entra no contrato

`McpConfigSource` como enum de contrato (`PASTE`, `WORKSPACE_FILE`, `CLAUDE_CODE`, `CLAUDE_DESKTOP`)
e o motivo de rejeição (`UNSUPPORTED_TRANSPORT`, `INVALID_KEY`, `MISSING_COMMAND`, `MISSING_URL`,
`ALREADY_REGISTERED`, `MALFORMED`). Congelado antes de qualquer implementação — é o que permite o
parser, o BFF e a tela serem construídos sem se atropelarem.

Nenhum `if` sobre convenção de caminho: onde cada fonte mora é campo declarado na relação, não regex
sobre string.

## Task T2: O parser puro — e as sete formas que ele tem que aguentar

`parseMcpDocument(texto)` → `{ candidatos, rejeicoes }`. Sem I/O, sem DI, exportada.

Casos, cada um vindo de uma medição:

1. `{ mcpServers: { x: { command, args } } }` — sem `type` ⇒ **STDIO** (a forma do `supermemory`)
2. `{ mcpServers: { x: { type: 'stdio', command, args, env } } }`
3. `{ mcpServers: { x: { type: 'http', url, headers } } }`
4. `{ projects: { "<path>": { mcpServers: {...} } } }` — a forma do `~/.claude.json`, filtrada pelo
   caminho do workspace
5. `type: 'sse'` ⇒ rejeição `UNSUPPORTED_TRANSPORT`, **nunca** descarte silencioso
6. chave fora de `^[a-z][a-z0-9-]{0,31}$` ⇒ rejeição `INVALID_KEY` com o nome original visível
7. JSON inválido ⇒ uma rejeição `MALFORMED`, não uma exceção que derruba a tela

Os valores de `env`/`headers` são **descartados na entrada** e só as chaves sobrevivem — o segredo
não chega nem a existir no candidato, o que é mais forte que confiar na camada seguinte para não
persistir.

## Task T3: A descoberta é porta, não `readFileSync` espalhado

`McpConfigDiscovery` abstrato com implementação `real` (lê os três caminhos declarados) e `mock`
(fixtures). Ligado por ambiente, como todo serviço deste repo — sem isso, um teste passa a depender
de qual máquina o roda, que é a medição nº 4.

Os caminhos por plataforma são **relação declarada**, não `if (process.platform)` no meio da leitura.

## Task T4: O BFF entrega candidatos por fonte

Query no contexto `ui`: lê as fontes disponíveis, roda o parser, cruza com os servidores JÁ
registrados (`ALREADY_REGISTERED` é rejeição, não duplicata silenciosa) e devolve candidatos +
rejeições prontos para a tela.

## Task T5: O import em lote, com o segredo em branco

Use case que registra N servidores numa transação. Cada `envKey`/`headerKey` entra com valor vazio, e
a tela bloqueia o salvar enquanto houver segredo em branco — **o mesmo `hasBlankSecret` do T5 do
PR #56**, não um segundo mecanismo paralelo.

## Task T6: O diálogo de import

Lista o que foi encontrado por fonte, com as rejeições visíveis e o motivo ao lado. O dono escolhe o
que importar; os segredos vazios aparecem para preenchimento antes de salvar.

## Task T7: Testar conexão antes de salvar — com o erro REAL

Botão no formulário que conecta e lista as ferramentas sem persistir nada. E, diferente do
`reachable` de hoje (medição nº 7), devolve **o erro nomeado** quando falha: comando inexistente,
pacote não encontrado, token recusado. É a diferença entre "não alcançável" e "o `npx` não está no
PATH".

Isso exige tocar `safeListTools`, que hoje engole a exceção — a informação existe e é jogada fora.

## Task T8: e2e

O dono cola um JSON, vê candidatos e rejeições, preenche um segredo, importa, e o servidor aparece na
lista. A rejeição de `sse` tem que estar visível no caminho feliz — é a garantia de que o descarte
silencioso não volta.

---

## O que este plano NÃO faz

- **Não lê o `~/.claude.json` inteiro para dentro do nosso banco.** Só a sub-árvore
  `projects[<workspace>].mcpServers`, e só as chaves de segredo.
- **Não renomeia chave em silêncio** para caber no nosso padrão.
- **Não adiciona transporte novo** ao contrato para acomodar `sse`. Se isso for desejado, é edição de
  contrato com migração, decidida à parte.

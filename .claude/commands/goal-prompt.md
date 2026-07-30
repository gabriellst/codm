---
description: Gera um goal prompt (pronto para colar no /goal) a partir das specs aprovadas/discutidas, no padrão prova-é-em-código da casa
argument-hint: "[paths de specs em .specs/ — vazio = specs Draft/Approved discutidas na conversa]"
---

# /goal-prompt — compilar specs em um goal executável

Você vai compor UM goal prompt para o founder colar no `/goal`. O goal é o contrato de execução:
condições verificáveis, prova em código, tudo local. Siga exatamente este processo.

## 1. Determinar o escopo

- `$ARGUMENTS` traz paths/globs de specs em `.specs/` → use-os.
- Sem argumentos: as specs `Status: Draft` ou `Approved` que foram objeto da conversa atual
  (as mais recentes de `.specs/` se a conversa não desambiguar). Na dúvida, pergunte em prosa —
  nunca adivinhe o escopo de um goal.

## 2. Extrair das specs (leia todas antes de compor)

- **Ordem das frentes** — dependências declaradas nas specs vencem qualquer outra heurística;
  chores marcados como "roda primeiro" abrem a fila.
- **ID curto por frente** (para as mensagens de commit) e o arquivo de cada spec.
- **ACs nomeadas** — todas entram na condição de saída-verde-citada.
- **Invariantes novas** (entidade, guard, rail, persistência) → cada uma vira um FALSEADOR
  obrigatório: vermelho com a implementação desligada, verde ligada, números citados.
- **Rodadas de pesquisa** exigidas pelas specs (varreduras de padrão na codebase, TS **e Go**
  quando a regra é language-agnostic) → viram condição própria com inventário no plano + grep
  final provando zero instâncias fora do inventário.
- **Regras language-agnostic** → cláusula GO-SHARING: bad practice/pattern entra nas DUAS
  variantes de skill (`…/typescript/registry.yaml` E `…/go/registry.yaml`) com exemplo real do
  lado Go; regra sem par Go não conta como entregue.
- **Contrato/SDK/enum mudou em alguma frente?** → gate extra `cd packages/app/react && bun x tsc`.

## 3. Regras fixas do skeleton (nunca omitir, nunca inventar)

- **Aprovação-ao-colar**: o primeiro ato da execução é marcar `Status: Approved` nas specs —
  o founder colar o goal É a aprovação.
- **Contrato fechado**: as Decisions das specs não se rediscutem; divergência real entre spec e
  código → PARE COM ACHADO (dizer e perguntar, nunca improvisar).
- **Condição (0) de coerência**: antes de qualquer `/plan`, um workflow com 1 verificador por
  spec (Sonnet) confere dependências, nomes decididos e contradições entre as specs.
- **Fluxo por frente**: `/plan .specs/<spec>.md` → implementação → commits referenciando o ID;
  frente seguinte só começa com a anterior 100% verde.
- **Gates** — use os comandos REAIS do repo (confira o package.json se houver dúvida; o script
  de e2e é `cd packages/e2e && bun run test` — `bun e2e` NÃO existe aqui):
  ```
  cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit
  cd packages/api/typescript && bun test        (queda de contagem explicada em commit)
  bun tsc · bun run test:tooling · bun check:generated
  cd packages/contracts && bun test codegen/
  cd packages/api/go && go build ./... && go test ./...
  cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts --check
  cd packages/e2e && bun run test
  ```
  **E2e quando viável**: o gate entra sempre; se uma frente não é exercitável por e2e, a
  condição DIZ isso explicitamente em vez de fingir cobertura — e nenhuma AC pode exigir o
  WhatsApp real nem subir o app desktop (AC assim está mal escrita; proponha a versão testável).
- **Orquestração**: Fable orquestra e decide; subagentes **Opus** para implementação/verificação
  de raciocínio alto, **Sonnet** para varreduras/renames/mecânica; workflows para fan-out
  (rodadas de pesquisa, verificação adversarial de ACs). Nunca Opus onde Sonnet basta.
- **Higiene git**: tudo local, sem push; stage explícito, nunca `git add -A`; `git status` limpo
  ao fechar cada frente; edições não commitadas do founder NUNCA staged sem pedir; nunca
  `git stash` através de regen de SDK/contracts.
- **Comunicação**: perguntas em prosa ou AskUserQuestion (≤4/rodada, recomendação primeiro);
  antes de teorizar sobre lentidão/flakiness, MEÇA (timestamps do banco, contadores).

## 4. Compor e retornar

Monte o goal como UM bloco cercado (```), numerando as condições — (0) coerência, (1) fluxo,
(2) pesquisa, (3) go-sharing, (4) ACs citadas, (5) falseadores, (6) gates, (7) orquestração,
(8) higiene git — seguido do parágrafo de Regras. Adapte números/conteúdo ao escopo real
(omitir (2)/(3) apenas se NENHUMA spec do escopo os exigir, dizendo por quê).

**LIMITE DURO: o `/goal` aceita no máximo 4000 caracteres.** Antes de retornar, escreva o bloco
num arquivo temporário e PROVE o tamanho com `wc -c` (cite a saída). Acima de 4000: comprima —
frases curtas, listas em linha, zero repetição entre condições — sem remover nenhuma condição
nem gate. Se mesmo comprimido não couber, divida em goals sequenciais por frente e diga isso.

Retorne SOMENTE: uma frase de contexto + o bloco pronto para colar. Nada de resumo das specs,
nada de próximos passos — o goal é o próximo passo.

# Frontend Conformance — Dialogs, Primitivos e Rails de Arquitetura

**Date:** 2026-07-29
**Status:** Approved
**Bounded Context:** app-react + scripts/cli
**Kind:** chore
**Story Points:** 8 — toca múltiplos componentes hand-written em rotas distintas, dois blocos novos de CLI e três testes de arquitetura repo-wide; nenhuma migração ou mudança de contrato, mas o raio de arquivos é largo.

## Context

`packages/app/react` tem um scaffolder maduro (`bun cli dialog/form/component`, código em `scripts/cli/frontend/`) que já resolve o shape de dialog (`useDialogStore().show(...)`), form (TanStack Form + schema da SDK) e primitivo (CVA + `ComponentProps`). Nos últimos ciclos, 3 dos 5 dialogs e todos os 5 primitivos analisados foram escritos à mão fora desse padrão, e dois shapes de composer se repetiram sem virar bloco de CLI. `ChangePasswordDialog` (`packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx`) é o único dos 5 dialogs que segue o padrão: é um conteúdo puro (`DialogContent`) devolvido pelo `useDialogStore().show(...)`, sem `open`/`onOpenChange` locais, com `hide()` vindo da store (`@/stores/useDialogStore`).

`useDialogStore` (`packages/app/react/src/stores/useDialogStore.tsx`) expõe `show(content)` / `hide()` / `confirm(options)` — todo o estado de "aberto" vive na store, e quem monta o conteúdo é quem chama `show()`.

## Problem

Três dialogs divergem do padrão da store, cada um com seu próprio `useState` de `open`:

- `AddWorkspaceDialog` (`packages/app/react/src/routes/(app)/workspaces/-components/AddWorkspaceDialog/index.tsx`) — `const [open, setOpen] = useState(false)` (linha 24) + `<Dialog open={open} onOpenChange={setOpen}>`, `path` como `useState` solto (linha 25) com `Input` (linha 78) sem `form.Field`, submit imperativo via `addWorkspace.mutate(...)`.
- `ThreadSettingsDialog` (`packages/app/react/src/routes/(app)/threads/$threadId/-components/ThreadSettingsDialog/index.tsx`) — `const [open, setOpen] = useState(false)` (linha 36) + `<Dialog open={open} onOpenChange={setOpen}>`; dentro, `ThreadSettingsBody` salva **por campo** — `Switch`/pills chamam mutation direto no `onCheckedChange`/`onClick`, e o `Input` da tag (linha 108) salva no `onBlur` (linha 115, `saveGate(true, tag)`) — não há um "Salvar" único.
- `ConnectChannelDialog` (`packages/app/react/src/routes/(app)/channels/-components/ConnectChannelDialog/index.tsx`) — `const [open, setOpen] = useState(false)` (linha 41) + `<Dialog open={open} onOpenChange={handleOpenChange}>`; por dentro roda uma máquina de estados de QR (`attempt`, `expired`, polling via `useGetChannel`) que não é um formulário e não deve virar um.

Cinco primitivos em `components/ui/` não estendem `ComponentProps` do elemento raiz — cada um declara sua própria interface fechada, sem spread de props nativas:

- `availability.tsx`, `confirm-dialog.tsx` (`ConfirmDialogProps` própria, linhas 5-15), `currency-selector.tsx`, `info-hint.tsx` (`InfoHintProps` própria, linhas 6-12), `metric-delta.tsx` (`MetricDeltaProps` própria, linhas 5-10).

Dois lugares reimplementam o mesmo shape de "textarea + Enter-to-send + mutation": `Composer` (`packages/app/react/src/routes/(app)/threads/$threadId/-components/Composer/index.tsx`, `Textarea` na linha 52, `send()` nas linhas 38-47) e `IssueSteerComposer` dentro de `IssueDetailSection` (`packages/app/react/src/routes/(app)/threads/$threadId/-components/IssueDetailSection/index.tsx`, `Textarea` na linha 214) — mesmo padrão de `useState<string>`, `onKeyDown` Enter-sem-shift, `Button` disabled por `!text.trim() || pending`.

Inputs soltos fora de `form.Field` aparecem em 5 pontos: `AddWorkspaceDialog:78`, `ThreadSettingsDialog:108`, `IssueDetailSection:214` (textarea do steer), `Composer:52` (textarea), `ContactStep:61` (busca — `packages/app/react/src/routes/attach/-components/ContactStep/index.tsx`). Dos 5, só o de `ContactStep` é legítimo: é uma busca local (`useState<string>` + filtro em memória, linha 34/61), não dado de formulário — os outros 4 são campos de dado sem `form.Field`.

Nada disso está codificado como regra automatizada: um novo dialog, primitivo ou composer pode repetir os mesmos desvios amanhã sem que lint/tsc acusem.

## Goal

Levar os 3 dialogs divergentes, os 5 primitivos e os 2 composers duplicados para os padrões que a CLI já sabe gerar, ensinar a CLI a gerar o que faltava (`live-settings`, `composer`), e travar as 3 regras resultantes como testes de arquitetura no `app-react` — para que a próxima peça fora do padrão quebre o teste em vez de passar despercebida.

## Decisions

1. **`AddWorkspaceDialog`, `ThreadSettingsDialog` e `ConnectChannelDialog` migram para `useDialogStore().show(...)`** — o dono do `open`/`content` passa a ser a store, igual `ChangePasswordDialog`. No `ConnectChannelDialog`, só o estado de "aberto" muda de dono; a máquina de QR (`attempt`, `expired`, polling) permanece interna ao componente.
2. **`ThreadSettingsDialog` mantém save-per-campo** (não vira um form com submit único) — a CLI ganha uma recipe nova `live-settings` para esse shape (toggle/pill que salva no próprio `onChange`/`onBlur`, sem botão "Salvar"), seguindo a house rule "se você escreveu, a CLI deveria escrever". `AddWorkspaceDialog` vira o padrão **create**: TanStack Form com schema vindo da SDK (`@codedm/client-typescript/typescript`), não mais `useState<string>` solto para `path`.
3. **A CLI ganha um bloco/recipe `composer`** (textarea + Enter-to-send + mutation) — `Composer` e o `IssueSteerComposer` de `IssueDetailSection` migram para esse bloco.
4. **Regra na skill `form`: busca nunca é form** — debounce + estado local ou URL-param, nunca `form.Field`. `ContactStep` (`packages/app/react/src/routes/attach/-components/ContactStep/index.tsx:61`) já está correto e serve de exemplo canônico na skill.
5. **Os 5 primitivos** (`availability.tsx`, `confirm-dialog.tsx`, `currency-selector.tsx`, `info-hint.tsx`, `metric-delta.tsx`) passam a estender `ComponentProps<'elementoRaiz'>` (ou do primitivo Base UI equivalente quando aplicável) com spread de props no elemento raiz, em vez de uma interface própria fechada.
6. **Três rails de arquitetura em `app-react`**, cada um um teste estilo i18n-coherence (varre o filesystem, roda em CI/test normal, whitelist central no próprio arquivo de teste com comentário explicando o porquê de cada exceção; `packages/app/react/src/routes/styleguide/` fica fora da varredura):
   - (a) todo arquivo `*Dialog*` em `-components/` referencia `useDialogStore`.
   - (b) todo `Input`/`Textarea`/`Select` usado dentro de `-components/` só aparece dentro de um `form.Field` — whitelist central cobre o bloco `composer` (textarea de mensagem) e buscas (`ContactStep` e equivalentes).
   - (c) todo primitivo em `components/ui/` estende `ComponentProps` do seu elemento raiz (pedido explícito do founder).
7. **As skills `component`, `form` e `primitive` ganham as regras acima como `bad_practices` nos respectivos `registry.yaml`** (react variant) — a decisão 4 na skill `form`, a decisão 5 na skill `primitive`, o padrão `useDialogStore` da decisão 1 na skill `component`.

## User Stories

**US-1 — Dialog padronizado via store**
Given um dev abre `AddWorkspaceDialog.tsx`,
When ele lê o componente,
Then vê `useDialogStore().show(...)` controlando abertura/fechamento — sem `useState` local para `open`.

**US-2 — ThreadSettingsDialog continua salvando por campo, mas via recipe da CLI**
Given um dev roda `bun cli component --recipe live-settings` (ou equivalente) para uma tela nova de configurações,
When o scaffold é gerado,
Then o shape de toggle/pill que salva no próprio `onChange`/`onBlur` já vem pronto, no formato usado por `ThreadSettingsDialog`.

**US-3 — AddWorkspaceDialog como create-form**
Given um dev abre o `AddWorkspaceDialog` migrado,
When ele lê o form,
Then o campo `path` é um `form.Field` do TanStack Form validado pelo schema da SDK, não mais um `useState<string>` solto.

**US-4 — Composer unificado**
Given um dev precisa de um novo composer (textarea + Enter-to-send + mutation),
When ele roda `bun cli component --block composer` (ou equivalente),
Then recebe o mesmo shape que `Composer` e `IssueSteerComposer` (agora migrados) usam.

**US-5 — Busca nunca é form**
Given um dev lê a skill `form` (react),
When ele chega na seção de bad practices,
Then vê a regra "busca nunca é form" com `ContactStep` como exemplo correto.

**US-6 — Primitivo estende ComponentProps**
Given um dev abre qualquer um dos 5 primitivos corrigidos,
When ele olha a assinatura de props,
Then vê `ComponentProps<'elementoRaiz'>` (ou do primitivo Base UI equivalente) estendido e spreadado no elemento raiz.

**US-7 — Rails quebram quando alguém foge do padrão**
Given um dev adiciona um novo `*Dialog*` sem `useDialogStore`, ou um `Input` fora de `form.Field` sem estar na whitelist, ou um primitivo sem `ComponentProps`,
When ele roda os testes do `app-react`,
Then o teste de rail correspondente falha apontando o arquivo.

## Acceptance Criteria

- [ ] AC-1: `AddWorkspaceDialog`, `ThreadSettingsDialog` e `ConnectChannelDialog` não têm mais `useState` local controlando `open`/`onOpenChange` do `Dialog` — a abertura é dirigida por `useDialogStore`.
- [ ] AC-2: `ConnectChannelDialog` preserva a máquina de estados de QR (`attempt`, `expired`, polling via `useGetChannel`) inalterada em comportamento — só o dono do `open` muda.
- [ ] AC-3: `ThreadSettingsDialog` continua salvando por campo (sem botão "Salvar" único) após a migração.
- [ ] AC-4: `scripts/cli/frontend/recipes/` (ou `blocks/`) ganha uma recipe `live-settings` referenciável via CLI, exercitada por pelo menos um teste do próprio `scripts/cli`.
- [ ] AC-5: `AddWorkspaceDialog` usa `useForm` (TanStack Form) com o campo `path` validado por um schema derivado da SDK (`@codedm/client-typescript/typescript`), não `useState<string>`.
- [ ] AC-6: `scripts/cli/frontend/blocks/` (ou `recipes/`) ganha um bloco `composer`, exercitado por pelo menos um teste do próprio `scripts/cli`.
- [ ] AC-7: `Composer` e o composer interno de `IssueDetailSection` (`IssueSteerComposer`) usam o bloco `composer` da CLI — nenhum dos dois reimplementa `useState<string>` + `onKeyDown` Enter-sem-shift à mão.
- [ ] AC-8: `.claude/skills/form/react/registry.yaml` tem uma entrada de `bad_practices` para "busca vira form" citando `ContactStep` como exemplo correto.
- [ ] AC-9: `availability.tsx`, `confirm-dialog.tsx`, `currency-selector.tsx`, `info-hint.tsx` e `metric-delta.tsx` estendem `ComponentProps` do respectivo elemento raiz e spreadam as props recebidas nele.
- [ ] AC-10: existe um teste em `packages/app/react` que varre `-components/` e falha se algum arquivo `*Dialog*` não referenciar `useDialogStore` (fora da whitelist comentada, se houver).
- [ ] AC-11: existe um teste em `packages/app/react` que varre `-components/` e falha se algum `Input`/`Textarea`/`Select` estiver fora de um `form.Field`, exceto os itens na whitelist central (composer, buscas como `ContactStep`) — cada exceção com comentário explicando o porquê.
- [ ] AC-12: existe um teste em `packages/app/react` que varre `components/ui/` e falha se algum primitivo não estender `ComponentProps` do elemento raiz.
- [ ] AC-13: `.claude/skills/component/react/registry.yaml`, `.claude/skills/form/react/registry.yaml` e `.claude/skills/primitive/react/registry.yaml` refletem as regras das decisões 1, 4 e 5 respectivamente em `bad_practices`.
- [ ] AC-14: `bun tsc` e `bun lint` passam limpos no `app-react` após as migrações.
- [ ] AC-15: a enumeração de ofensores desta spec (5 primitivos, 6 sítios de input solto, 5 dialogs) é um snapshot de 29-jul — o `/plan` **re-executa a varredura** na codebase atual antes de fechar tarefas (o código muda), e as whitelists dos 3 rails nascem da varredura fresca, não desta lista; qualquer ofensor novo encontrado entra no escopo da frente.

## O que sobe pro template

- **Skills:** `.claude/skills/component/react/registry.yaml` ganha `bad_practice` para dialog sem `useDialogStore`; `.claude/skills/form/react/registry.yaml` ganha `bad_practice` "busca vira form" (com `ContactStep` como canonical snippet) e referência à recipe `live-settings`; `.claude/skills/primitive/react/registry.yaml` ganha `bad_practice` "primitivo sem `ComponentProps`".
- **CLI (`scripts/cli/frontend/`):** nova recipe `live-settings` em `scripts/cli/frontend/recipes/` (toggle/pill save-on-change, sem botão de submit único) e novo bloco `composer` em `scripts/cli/frontend/blocks/` (textarea + Enter-to-send + mutation) — ambos referenciáveis por `bun cli component`/`bun cli dialog`.
- **Registry central (`.claude/registry.yaml`):** nenhuma mudança de mapeamento arquivo→skill é necessária — os 3 rails vivem como testes em `packages/app/react`, não como entrada nova do registry global.
- **Rails (testes de arquitetura):** três testes novos em `packages/app/react` (dialog→store, input-fora-de-form.Field, primitivo→ComponentProps), cada um com whitelist central comentada — infraestrutura de conformidade reutilizável para o resto do template, não específica do codedm.

## Open Questions

- Path exato dos 3 novos testes de rail dentro de `packages/app/react` (ex.: `src/__tests__/rails/` vs colocado perto de `tests/`) — decisão de organização de pasta, não de arquitetura; fica para o `/plan`.

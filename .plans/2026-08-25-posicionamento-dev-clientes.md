# Posicionamento: dev que atende clientes pelo WhatsApp — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** A landing e o console prometem só o que o produto de hoje entrega — hero específico no *como* (pedido no grupo → agente executa → você aprova, sem ticket) e livre no *quem*; "sem conta" some; Codex/OpenCode viram "em breve" — e um `PRD.md` na raiz fixa segmento, promessa, tese de PMF e a régua de copy.

**Architecture:** Só copy e documentação. Os dois JSON da landing (`home.{pt,en}.json`) são uma content collection Astro validada por Zod (`_content/config.ts`) — trocamos **valores**, nunca chaves, e `pricing.included` continua com 8 itens. Os catálogos do console (`locales/{pt,en}.json`) são lidos por `t()` e guardados pelo rail `tests/architecture/i18n-assertions.test.ts` — mesma regra: valores mudam, chaves ficam. `PRD.md` é um arquivo novo na raiz, anchor que `/brainstorm` e `docs/BOOTSTRAP.md` já esperam.

**Tech Stack:** Astro 5 (content collections + Zod), React + i18next JSON catalogs, Markdown

**Spec:** .specs/2026-08-25-posicionamento-dev-clientes-design.md
**Tasks:** 3
**Estimated minutes:** 50

---

## Task T1: A landing promete só o que o produto entrega

**Files to write:**
- Modify: `packages/app/astro/src/pages/[locale]/_content/home.pt.json` — 6 valores: hero (3), pricing (3: `chipNoAccount`, `explanation`, `included[1]`), capabilities (`cards[5].body`)
- Modify: `packages/app/astro/src/pages/[locale]/_content/home.en.json` — as mesmas 6 chaves, em EN

**Files to read:**
- `packages/app/astro/src/pages/[locale]/_content/config.ts` — schema Zod da collection `landing` (chaves obrigatórias, `included.length(8)`)
- `packages/app/astro/src/pages/[locale]/index.astro` — linha 36 monta o `<title>` de `hero.titleBold + hero.titleLight`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** (none — edição de conteúdo JSON, sem artefato de código)
**Depends on:** (none)
**Consumes (frozen):** (none — Task folha; o texto final está integralmente neste Task)
**Scope fence:** DONE aqui: apenas os 6 valores listados por locale. OUT: `hero.cards`, `hero.tagline`, `hero.freeChip`, `howItWorks`, `useCases`, `footer`, `nav`, `plans.json` — ficam byte-a-byte iguais (spec Decision 8 / AC-2). OUT: catálogos do console (T2) e `PRD.md` (T3). Nunca adicionar/remover chave: o schema Zod em `_content/config.ts` rejeita.
**Gate:** `grep -riE 'sem conta|no account|não existe conta|no account to create' packages/app/astro/src` retorna vazio · `bun x nx run app-astro:build` exit 0 · `bun x nx run app-astro:lint` exit 0

### Step T1.1 — RED: provar que as promessas falsas existem hoje

Run:

```bash
grep -rnE 'sem conta|no account|não existe conta|no account to create|Codex, Claude Code, OpenCode' packages/app/astro/src
```

Expected: 5 linhas — `home.pt.json` (`hero.subtitle`, `pricing.explanation`, `pricing.chipNoAccount`) e `home.en.json` (`hero.subtitle`, `pricing.explanation`, `pricing.chipNoAccount`). Se retornar vazio, alguém já fez o trabalho — pare e reporte.

### Step T1.2 — Editar `home.pt.json` (6 valores, chaves intactas)

Modify `packages/app/astro/src/pages/[locale]/_content/home.pt.json` — trocar **somente o valor** de cada chave abaixo, preservando tabs, ordem e todas as demais chaves:

| Caminho | Novo valor |
|---|---|
| `hero.titleBold` | `Sem ticket, sem fila,` |
| `hero.titleLight` | `sem sair do grupo.` |
| `hero.subtitle` | `Agentes na sua máquina executam projetos, clientes e processos\na partir de uma mensagem no WhatsApp. Você aprova antes.` |
| `pricing.explanation` | `Tudo que roda na sua máquina é grátis — os agentes são seus e o código é MIT. A conta é grátis e serve só para identificar você: sem cartão.` |
| `pricing.included[1]` | `Claude Code hoje · Codex e OpenCode em breve` |
| `pricing.chipNoAccount` | `conta grátis · sem cartão` |
| `capabilities.cards[5].body` | `Claude Code hoje, Codex e OpenCode em breve — cada tarefa com o agente certo.` |

Notas:
- `hero.subtitle` mantém um `\n` (a string JSON contém a sequência de escape `\n`, como hoje) — o hero renderiza com `whitespace-pre-line`.
- `capabilities.cards[5]` é o card `"tag": "Multi-agente"` (ícone `bot`); `title` ("Vários agentes por conversa") fica.
- `pricing.included` continua com exatamente 8 itens.

### Step T1.3 — Editar `home.en.json` (as mesmas 6 chaves)

Modify `packages/app/astro/src/pages/[locale]/_content/home.en.json` — mesma regra (só valores):

| Caminho | Novo valor |
|---|---|
| `hero.titleBold` | `No tickets, no queue,` |
| `hero.titleLight` | `no leaving the group chat.` |
| `hero.subtitle` | `Agents on your machine run projects, clients and processes\nfrom a single WhatsApp message. You approve first.` |
| `pricing.explanation` | `Everything that runs on your machine is free — the agents are yours and the code is MIT. The account is free and only identifies you: no card.` |
| `pricing.included[1]` | `Claude Code today · Codex and OpenCode coming soon` |
| `pricing.chipNoAccount` | `free account · no card` |
| `capabilities.cards[5].body` | `Claude Code today, Codex and OpenCode coming soon — each task with the right agent.` |

### Step T1.4 — GREEN: gate de copy

Run:

```bash
grep -riE 'sem conta|no account|não existe conta|no account to create' packages/app/astro/src; echo "exit=$?"
```

Expected: nenhuma linha, `exit=1` (grep sem match).

Run:

```bash
for f in packages/app/astro/src/pages/\[locale\]/_content/home.pt.json packages/app/astro/src/pages/\[locale\]/_content/home.en.json; do
  jq -r '[.hero.titleBold, .hero.titleLight, .hero.subtitle] | join(" | ")' "$f"
  jq -r '.pricing.included | length' "$f"
done
```

Expected:
```
Sem ticket, sem fila, | sem sair do grupo. | Agentes na sua máquina executam projetos, clientes e processos
a partir de uma mensagem no WhatsApp. Você aprova antes.
8
No tickets, no queue, | no leaving the group chat. | Agents on your machine run projects, clients and processes
from a single WhatsApp message. You approve first.
8
```

### Step T1.5 — Build + lint do astro

Run:

```bash
bun x nx run app-astro:build && bun x nx run app-astro:lint
```

Expected: build conclui (schema Zod da collection aceita os dois JSON; o `<title>` gerado é `CODM — Sem ticket, sem fila, sem sair do grupo.`); lint 0 erros.

### Step T1.6 — Commit

```bash
git add "packages/app/astro/src/pages/[locale]/_content/home.pt.json" \
        "packages/app/astro/src/pages/[locale]/_content/home.en.json"
git commit -m "content(landing): hero sem burocracia, conta grátis em vez de 'sem conta', Codex/OpenCode em breve (Task T1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task T2: O console não promete "sem conta"

**Files to write:**
- Modify: `packages/app/react/src/locales/pt.json` — 2 valores: `console.footerNoAccount`, `onboarding.slide1Body`
- Modify: `packages/app/react/src/locales/en.json` — as mesmas 2 chaves, em EN

**Files to read:**
- `packages/app/react/tests/architecture/i18n-assertions.test.ts` — rail que indexa os dois catálogos; garante que ninguém assere o valor antigo literalmente
- `packages/app/react/src/routes/onboarding/-components/ValueSlide/index.tsx` — consumidor de `onboarding.slide1Body` (linha 35)

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** (none — edição de catálogo i18n, sem artefato de código)
**Depends on:** (none)
**Consumes (frozen):** (none — Task folha; o texto final está integralmente neste Task)
**Scope fence:** DONE aqui: só `console.footerNoAccount` e `onboarding.slide1Body` nos dois catálogos. OUT: `console.footerLocal`, `onboarding.slide1Title` e qualquer outra chave; landing (T1); `PRD.md` (T3). A chave `footerNoAccount` **mantém o nome** (renomear quebraria `t()` e o tipo derivado em `packages/e2e/utils/i18n.ts`).
**Gate:** `grep -riE 'sem conta|no account' packages/app/react/src/locales` retorna vazio · `cd packages/app/react && bun test tests/architecture/i18n-assertions.test.ts` passa · `bun x nx run app-react:tsc` exit 0

### Step T2.1 — RED: provar que a promessa existe hoje no console

Run:

```bash
grep -rnE 'sem conta|no account' packages/app/react/src/locales
```

Expected: 4 linhas — `pt.json:199` (`footerNoAccount`), `pt.json:579` (`slide1Body`), `en.json:199`, `en.json:579`.

### Step T2.2 — Editar `pt.json`

Modify `packages/app/react/src/locales/pt.json` — só valores:

| Chave | Novo valor |
|---|---|
| `console.footerNoAccount` | `Conta grátis · sem cartão` |
| `onboarding.slide1Body` | `O CODM conecta o WhatsApp a agentes de código rodando neste computador — converse com seu código como em qualquer plataforma de mensagens. Mais canais em breve. Código aberto, conta grátis, tudo permanece local.` |

### Step T2.3 — Editar `en.json`

Modify `packages/app/react/src/locales/en.json` — só valores:

| Chave | Novo valor |
|---|---|
| `console.footerNoAccount` | `Free account · no card` |
| `onboarding.slide1Body` | `CODM connects WhatsApp to coding agents running on this computer — DM your codebase like it's any DM platform. More channels coming soon. Open source, free account, everything stays local.` |

### Step T2.4 — GREEN: gate de copy + rail de i18n

Run:

```bash
grep -riE 'sem conta|no account' packages/app/react/src/locales; echo "exit=$?"
cd packages/app/react && bun test tests/architecture/i18n-assertions.test.ts
```

Expected: grep vazio com `exit=1`; o teste do rail passa (nenhum teste/e2e assere os valores antigos como literal — verificado no planejamento).

### Step T2.5 — Type-check do react

Run: `bun x nx run app-react:tsc`
Expected: 0 erros (chaves inalteradas ⇒ o tipo derivado do catálogo não muda).

### Step T2.6 — Commit

```bash
git add packages/app/react/src/locales/pt.json packages/app/react/src/locales/en.json
git commit -m "content(console): 'conta grátis · sem cartão' substitui 'sem conta' no rodapé e no onboarding (Task T2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task T3: Existe um PRD.md que fixa o posicionamento

**Files to write:**
- Create: `PRD.md` — documento de produto na raiz (posicionamento, ICP, tese de PMF, o que falta, riscos, régua de copy, vizinhos)

**Files to read:**
- `.specs/2026-08-25-posicionamento-dev-clientes-design.md` — fonte de todas as afirmações
- `.claude/skills/prd/SKILL.md` — bloco `## Vision` (Problem Statement / Target Users / Value Proposition / Success Metrics) que abre o documento

**Agent:** product-owner
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /prd
**Depends on:** (none)
**Consumes (frozen):** (none — Task folha; o conteúdo do arquivo está integralmente abaixo)
**Scope fence:** DONE aqui: criar `PRD.md` com o conteúdo do Step T3.2 **como está** — não expandir para listas `FR-xxx`/NFR da skill `/prd` (a spec não pediu; Decision 6 fixa as seções). OUT: qualquer edição em landing/console (T1/T2), README, blog, docs/. Não afirmar como existente: runner de Codex/OpenCode, Windows/Linux, Telegram, métricas de funil, uso por cliente, runner hospedado — todos aparecem só em "O que falta" ou "Riscos" (AC-7).
**Gate:** `test -f PRD.md` · `grep -nE '^## ' PRD.md` lista as 8 seções na ordem do Step T3.2 · `grep -niE 'codex.*(funciona|disponível|available|works)|windows.*(disponível|available)|telegram.*(disponível|available)' PRD.md` retorna vazio

### Step T3.1 — RED: o anchor não existe

Run: `test -f PRD.md; echo "exit=$?"`
Expected: `exit=1`.

### Step T3.2 — Proposed file

```markdown
# PRD — codm

**Atualizado:** 2026-08-25 · **Fonte:** `.specs/2026-08-25-posicionamento-dev-clientes-design.md`

Este documento é a fonte de verdade de **segmento, promessa, tese de PMF e régua de copy**. Toda spec (`/brainstorm`) e toda peça de copy (landing, console, README, blog) parte daqui. Quando o produto mudar o que entrega, este arquivo muda primeiro.

## Vision

**Problem Statement:** Quem opera projetos, clientes e processos recebe demandas onde as pessoas já estão — grupos de WhatsApp — mas a execução acontece em outro lugar (terminal, agentes de código, scripts). Entre o pedido e o resultado entra burocracia (ticket, Jira, e-mail, fila) que quem pede ignora e quem executa carrega sozinho.

**Target Users:** Primário — dev solo, freelancer ou agência pequena que atende clientes pelo WhatsApp (2–15 clientes ativos, cada um com seu grupo) e já usa Claude Code. Secundário — o time e os clientes desse dev, que só precisam mandar mensagem no grupo. O dono de negócio não-técnico entra **pela mão do dev** (o dev escreve as skills; o cliente as roda no grupo), nunca como alvo direto enquanto o onboarding exigir Claude Code + pasta de projeto + macOS.

**Value Proposition:** Um pedido no grupo vira trabalho executado por agentes na máquina do dev, que aprova antes — sem ticket, sem fila, sem sair do WhatsApp. O produto vende **orquestração**, não inferência: o usuário traz a própria conta Claude, o próprio WhatsApp e as próprias pastas; tudo roda local.

**Success Metrics:** os três sinais de PMF da seção "Tese de PMF", medidos com design-partners antes de qualquer campanha.

## Posicionamento

**Promessa (hero da landing):**

> **Sem ticket, sem fila, sem sair do grupo.**
> Agentes na sua máquina executam projetos, clientes e processos a partir de uma mensagem no WhatsApp. Você aprova antes.

O hero é específico no **como** (pedido no grupo → agente executa → você aprova) e livre no **quem** — o produto tem vários usos (cliente reportando bug, time pedindo deploy, processo agendado de cobrança/relatório) e os casos de uso da landing mostram essa variedade. O segmento-alvo vive aqui e na **ordem** dos casos de uso, não como restrição do hero.

**Contra o quê:** burocracia de intake — ticket, Jira, e-mail, fila. Não contra outros produtos de agentes.

**Mecanismo, em três batidas (o que nunca sai do copy):**
1. **Manda no grupo** — a mensagem no WhatsApp (contato ou grupo) é o pedido; sem formulário.
2. **O agente executa na sua máquina** — sessão de terminal na pasta do projeto, com as skills que já existem lá; pedidos concorrentes rodam em paralelo, não em fila.
3. **Você aprova antes** — sussurros (orientação privada ao agente), pausa em erros e decisões sensíveis, resposta volta no grupo com o label da tarefa.

**Ferramentas são prova, não promessa.** Claude Code, pasta de projeto, skills, Tauri, SQLite aparecem abaixo da dobra (como funciona, capacidades), nunca no hero.

## ICP & operador

| | |
|---|---|
| **Quem instala** | O **operator**: dono do repositório e da máquina. Técnico. Já paga Claude Code. |
| **Quem pede** | Clientes e time do operator, nos grupos. Não instalam nada; só mandam mensagem. |
| **Situação** | 22h, o cliente manda "o cupom quebrou no mobile" no grupo. Hoje o operator abre o notebook, acha o repo, corrige, sobe, responde — e não escala além de N clientes. |
| **Alternativas que ele usa hoje** | Nada (responde na mão) ou uma ferramenta de gestão que o cliente ignora e volta pro grupo. |
| **Por que compra** | Vira **revisor** em vez de executor: mais clientes com as mesmas noites livres. Uso por cliente vira linha de fatura. |
| **Por que o cliente dele gosta** | Nunca saiu do grupo; recebe ack, status e o resultado (link de preview, print) no mesmo lugar. |

## Tese de PMF

**Hipótese:** o dev que atende clientes pelo WhatsApp é o único segmento onde, hoje, coincidem (a) o produto entrega sem mudar (macOS + Claude Code + pasta é trivial pra ele), (b) há dinheiro (ele cobra do cliente), e (c) a distribuição é orgânica por construção — cada grupo onde o codm responde expõe a marca a quem ainda não é usuário.

**Sinais que confirmam (todos os três, com ≥10 design-partners e grupos reais):**

1. **Sean Ellis ≥ 40%** — respondem "ficaria muito decepcionado" se o codm sumisse.
2. **Retenção semana-4 ≥ 50%** dos que ativaram (checklist de 3 passos completo + primeira issue respondida no grupo).
3. **≥ 30% dos novos installs** originados de um grupo onde o codm já respondia (o loop orgânico é real).

Se (3) não aparecer, o loop é hipótese, não fato — a distribuição precisa ser paga ou por conteúdo. Se (1) ou (2) falharem, o problema é produto, não marketing: voltar ao "O que falta".

## O que falta para o PMF (na ordem)

Os itens 1–4 precedem qualquer campanha. Nada abaixo é feature existente até que uma spec própria a entregue.

1. **Landing e console dizem a promessa e só ela** — hero acima; "conta grátis · sem cartão" no lugar de "sem conta"; Codex e OpenCode como "em breve" (hoje só o Claude Code tem runner). *(entregue por esta rodada — spec 2026-08-25)*
2. **Time-to-first-wow < 10 minutos, medido** — DMG → QR → pasta → vincular grupo → primeira mensagem respondida com um artefato. Instrumentar o funil no metering existente; caçar cada minuto.
3. **Loop voltado a quem pede, impecável** — ack imediato, indicador de "trabalhando", entrega como link de preview ou print, aprovação do operator antes de qualquer resposta sensível. Uma resposta errada no grupo do cliente queima o dev, não o codm.
4. **10–20 design-partners** com grupos reais; medir os três sinais semanalmente; escrever os números antes de começar.
5. **Camada de gestão de clientes** (só depois de 4 confirmar o segmento) — visão de issues cruzando grupos, configuração de agente por cliente, **uso por cliente** para faturar, kit inicial de skills para o cenário SMB (relatório, status, deploy preview), loops como cron-no-grupo.
6. **Distribuição** — assinatura discreta nas respostas do agente (com opt-out) para explorar o loop do item 4; conteúdo para a comunidade dev BR em PT primeiro; o blog já tem os dois posts certos (*plantão sem fila*, *roteando issues pelo chat*).
7. **Monetização** — free local como está; pago nas features do item 5 e, mais tarde, num runner "sempre ligado", que tensiona o local-first e exige decisão própria.
8. **Segundo agente e segundo canal** — runner real para Codex/OpenCode; Telegram como segundo canal (ver Riscos).

## Riscos

- **macOS-only.** Parcela relevante dos devs freelancers no Brasil está em Windows/Linux; o teto do segmento é menor do que parece até existir build para essas plataformas.
- **WhatsApp não-oficial (whatsmeow).** Banimento de número é risco real — e o número é o do operator, que usa com os clientes. O onboarding deve recomendar número dedicado; é o argumento para Telegram vir cedo.
- **Reputação no grupo do cliente.** O gate de aprovação e o sussurro são a defesa; qualquer afrouxamento é decisão de produto, não de UX.
- **Enquadramento "assistente pessoal".** Se o copy ficar genérico ("agentes de IA no seu WhatsApp"), o produto é lido como variante de assistente pessoal self-hosted e perde a diferença. Manter o mecanismo específico.

## Régua de copy

1. **Nunca prometer o que o onboarding nega.** Se o console pede conta, a landing não diz "sem conta". Se só o Claude Code roda, Codex/OpenCode são "em breve". A régua vale para landing, console, README, blog e release notes.
2. **Mecanismo no hero, ferramentas abaixo da dobra.** Nomes de agente/framework são prova, não promessa.
3. **Ator livre.** O hero não fixa quem pede (cliente, time, processo); os casos de uso mostram a variedade, com o cenário do cliente em primeiro.
4. **"Sem burocracia" é literal:** sem ticket, sem fila, sem sair do grupo, conta grátis, sem cartão. Cada termo tem que ser verdadeiro no produto instalado.
5. **Copy agnóstica de plataforma** ("computador", não "Mac") salvo no botão de download e na permissão de disco.
6. PT é a língua-fonte; EN espelha 1:1 as mesmas chaves.

## Vizinhos & concorrentes

**OpenClaw** (openclaw.ai) — assistente pessoal genérico, self-hosted, MIT, 29+ canais, público "developers and power users", instalação por `curl | bash`. Compartilha a **infraestrutura** com o codm (gateway local, dados na máquina, grátis, open source) mas não o **job**: OpenClaw é o assistente (inbox, agenda, browser, skills comunitárias); codm é o roteador entre a conversa e os agentes de código que o dev já usa, com issue como unidade de trabalho e aprovação como gate. Tratar como vizinho — "use um assistente pessoal pra sua agenda; use codm pro seu repo" — nunca citar na landing, nunca disputar largura de canais/integrações.

**Ferramentas de gestão (Jira, ClickUp, tickets por e-mail)** — são o "contra o quê". O codm não as substitui; ele remove a necessidade de o cliente entrar nelas.

**Diferenciais defensáveis (os que lideram o copy):** workspace = pasta do projeto com skills detectadas; issue como fork paralelo com estado; grupo com cliente + sussurro + aprovação; app desktop de instalar e usar (DMG + QR + 3 passos). "Roda local", "open source", "grátis" são paridade com o vizinho — necessários, não vendem.
```

### Step T3.3 — GREEN: gates do documento

Run:

```bash
test -f PRD.md && grep -nE '^## ' PRD.md
```

Expected (nesta ordem):
```
## Vision
## Posicionamento
## ICP & operador
## Tese de PMF
## O que falta para o PMF (na ordem)
## Riscos
## Régua de copy
## Vizinhos & concorrentes
```

Run:

```bash
grep -niE 'codex.*(funciona|disponível|available|works)|windows.*(disponível|available)|telegram.*(disponível|available)' PRD.md; echo "exit=$?"
```

Expected: vazio, `exit=1` (AC-7 — nenhuma feature futura afirmada como existente).

### Step T3.4 — Commit

```bash
git add PRD.md
git commit -m "docs(prd): posicionamento, ICP, tese de PMF e régua de copy (Task T3)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean (nenhuma chave de catálogo mudou)
- [ ] `bun lint` — lint clean (biome nos JSON + astro)
- [ ] `bun run test` — todos os testes (inclui `app-react:test` com o rail `i18n-assertions`)
- [ ] `bun x nx run app-astro:build` — landing compila contra o schema Zod
- [ ] E2E: **nenhum spec e2e assere copy de hero/pricing/onboarding como literal** (verificado no planejamento: `grep -riE 'sem conta|no account|titleBold|chipNoAccount' packages/e2e` vazio); mudança é copy-only, sem e2e novo — a régua I18N-01 proíbe asserir literal de catálogo.
- [ ] AC mapping (cada AC → gate executável):
  - AC-1 → T1 Step T1.4 (`jq` dos três campos do hero nos dois locales; `grep -iE 'claude code|codex|opencode|pasta de projeto|project folder|skills'` sobre `.hero.titleBold/.titleLight/.subtitle` vazio)
  - AC-2 → T1 Scope fence: `git diff --stat` do commit T1 toca só as 6 chaves; `jq '.howItWorks, .useCases, .footer.headline'` idêntico a `git show HEAD~1:<file>`
  - AC-3 → T1 Step T1.4 (grep negativo em `packages/app/astro/src`; `chipNoAccount` = "conta grátis · sem cartão" / "free account · no card")
  - AC-4 → T2 Step T2.4 (grep negativo em `packages/app/react/src/locales`; rail `tests/architecture/i18n-assertions.test.ts` verde)
  - AC-5 → T1 Steps T1.2/T1.3 (`jq '.pricing.included[1], .capabilities.cards[5].body'` = valores "hoje · em breve" / "today · coming soon")
  - AC-6 → T3 Step T3.3 (8 seções `## ` na ordem)
  - AC-7 → T3 Step T3.3 (grep negativo de features futuras afirmadas como existentes)
  - AC-8 → Final Validation (`bun x nx run app-astro:build` + `bun run test`)

## Notes

- **Nenhuma chave JSON muda** — só valores. `_content/config.ts` (Zod) rejeita chave faltante e exige `pricing.included.length(8)`; `packages/e2e/utils/i18n.ts` deriva o tipo das chaves de `pt.json`.
- **Formatação:** os catálogos usam tabs; o hook `pre-commit` roda `lint-staged` (biome) nos arquivos staged — se o biome reformatar, é esperado; não desfazer.
- **`hero.subtitle` mantém `\n`** (escape dentro da string JSON) — o hero renderiza com `whitespace-pre-line`; o `<title>` da página usa só `titleBold + titleLight`.
- **Sem Contract Lock** — nenhum controller/schema/SDK muda.
- **Sem `bun cli`** — nenhum artefato de código é criado (JSON de conteúdo + Markdown).
- As três Tasks são independentes: `/build` pode despachar T1, T2 e T3 na mesma wave.

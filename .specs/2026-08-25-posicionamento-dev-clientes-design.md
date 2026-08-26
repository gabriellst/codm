# Posicionamento de marca: dev que atende clientes pelo WhatsApp — Design Spec

**Date:** 2026-08-25
**Status:** Approved
**Bounded Context:** cross-context: landing (`packages/app/astro`), console copy (`packages/app/react` locales), product docs (`PRD.md`)
**Kind:** chore
**Story Points:** 2 — edição de copy em quatro arquivos de locale (astro pt/en + react pt/en) e um doc novo na raiz; zero schema, zero rota, zero migração.

## Context

O codm é um app desktop (Tauri) que pareia o WhatsApp do usuário, vincula conversas (contato ou grupo) a uma pasta de projeto e deixa agent CLIs (`ProviderKind = CLAUDE_CODE | CODEX | OPENCODE`, `packages/contracts/src/wire/enums/provider-kind.tsp`) executarem issues em paralelo na máquina do usuário, devolvendo artefatos (`ArtifactKind LINK/IMAGE/...`) no chat. A execução é local por definição de produto e a nuvem só guarda identidade (`.specs/2026-08-06-produto-desktop-roadmap.md`, Decisions 1–2; `.specs/2026-08-06-sp2-conta-oauth-design.md`).

A landing (`packages/app/astro/src/pages/[locale]/_content/home.{pt,en}.json`) já vende, do meio pra baixo, o cenário de **cliente/grupo/processo**: `howItWorks.subtitle` diz *"agentes que gerenciam seus projetos direto dos seus grupos e execute processos sem sair do grupo da empresa"*, o exemplo é *"o boleto do cliente Acme não gerou, resolve?"*, e `useCases` lista triagem de bugs do cliente, atendimento com aprovação, processos internos e plantão sem fila. O `footer.headline` ("Seu time já está no grupo. Agora seu código também.") está no mesmo tom.

O que está desalinhado é a cabeça da página e as promessas de preço:

- `hero` fala em dev-speak puro: *"Fale com seus agentes sem sair do grupo"* + *"Codex, Claude Code, OpenCode. Qualquer agente da sua pasta de projeto, invocado com as skills que já existem"*.
- `pricing.chipNoAccount` = *"sem conta, sem cartão"* e `pricing.explanation` termina em *"não existe conta para criar"*, enquanto a decisão vigente do SP2 é que sem login os agentes param e o console pede conta (`.specs/2026-08-06-sp2-conta-oauth-design.md:15,64`). A spec SP2.5 já havia mandado remover essa string (`.plans/2026-08-06-sp2-5-distribuicao-publica.md:203`); ela voltou.
- O card `capabilities` "Multi-agente" e `pricing.included[1]` prometem *"Claude Code, Codex e OpenCode"*, mas só o Claude Code tem runner — Codex e OpenCode são detect-only / `comingSoon` (`packages/api/typescript/src/catalog/agent-models.ts:39`, `AGENT_MODELS[CODEX] = []`).
- A mesma promessa "sem conta" vive dentro do console: `console.footerNoAccount` e `onboarding.slide1Body` em `packages/app/react/src/locales/{pt,en}.json`.

Não existe doc de produto/posicionamento: `PRD.md` na raiz (anchor que a skill `/brainstorm` espera como "Product context") está ausente, e nenhum arquivo em `.specs/`, `.plans/` ou `docs/` menciona concorrentes (OpenClaw etc.), ICP ou tese de PMF. O único ponto de referência competitivo é o `docs/BOOTSTRAP.md` (método genérico).

Concorrente de referência: **OpenClaw** (openclaw.ai) — assistente pessoal genérico, self-hosted, MIT, 29+ canais, público "developers and power users", instalação por `curl | bash`. Compartilha a infraestrutura (gateway local, dados na máquina, grátis, open source) mas não o job: OpenClaw é o assistente; codm é o roteador entre a conversa do cliente e os agentes de código que o dev já usa.

## Problem

1. A marca se apresenta como "ferramenta de dev pra falar com agentes" (hero) enquanto o corpo da landing e os casos de uso vendem o edge real — gestão de clientes, grupos e processos pelo WhatsApp. Quem lê só a dobra classifica o codm como "um OpenClaw só com WhatsApp".
2. A landing e o console prometem "sem conta" quando a conta é obrigatória. "Sem burocracia" não pode começar com uma promessa que o onboarding nega.
3. A landing promete três agentes quando um funciona; o "multi-agente" como pilar de marketing está vazio.
4. Não há documento que fixe segmento, promessa, contra-o-quê e sinais de PMF — cada peça de copy reinventa o posicionamento.

## Goal

Quem chega na landing entende em cinco segundos o mecanismo do codm: um pedido no grupo do WhatsApp (de um cliente, do time ou um processo da empresa) vira trabalho executado por agentes na máquina do dev, que aprova antes — sem ticket, sem fila. O hero é específico no **como** e livre no **quem**; o segmento-alvo (dev que atende clientes) vive no PRD e na ordem dos casos de uso, não como restrição do hero. Toda promessa visível (landing e console) é cumprível pelo produto de hoje. Um `PRD.md` na raiz passa a ser a fonte de verdade de segmento, promessa, tese de PMF e régua de copy para specs futuras.

## Decisions

1. **Segmento-alvo:** dev solo / freelancer / agência pequena que atende clientes pelo WhatsApp (2–15 clientes ativos, cada um com seu grupo) e já usa Claude Code. O dono de negócio não-técnico entra **pela mão do dev** (o dev escreve as skills; o cliente as roda no grupo) — nunca como alvo direto da marca enquanto o onboarding exigir Claude Code + pasta + macOS.
2. **Promessa do hero (opção 3 — "sem burocracia", sem ator fixo):** o hero nomeia o mecanismo (pedido no grupo → agente executa → você aprova) e deixa o ator livre, para não restringir os usos do produto; os `useCases` logo abaixo mostram a variedade.
   - PT — `titleBold`: **"Sem ticket, sem fila,"** / `titleLight`: **"sem sair do grupo."** — `subtitle`: *"Agentes na sua máquina executam projetos, clientes e processos a partir de uma mensagem no WhatsApp. Você aprova antes."*
   - EN — `titleBold`: **"No tickets, no queue,"** / `titleLight`: **"no leaving the group chat."** — `subtitle`: *"Agents on your machine run projects, clients and processes from a single WhatsApp message. You approve first."*
   - Nomes de ferramenta (Claude Code, Codex, OpenCode, "pasta de projeto", "skills") saem do hero e permanecem como prova abaixo da dobra (`howItWorks`, `capabilities`).
   - Descartadas: opção A ("Seu cliente manda no grupo…") por fixar o ator; um hero genérico ("agentes de IA no seu WhatsApp") por recair no enquadramento OpenClaw.
3. **Contra o quê:** burocracia de intake (ticket, Jira, e-mail, fila) — não contra o OpenClaw. OpenClaw é tratado como vizinho ("assistente pessoal"), nunca citado na landing.
4. **Promessa "sem conta" removida em todos os pontos**, landing e console. Substituta: **"conta grátis · sem cartão"** (PT) / **"free account · no card"** (EN). `pricing.explanation` passa a dizer que a conta é grátis e serve só para identificar o usuário. `console.footerNoAccount` e `onboarding.slide1Body` seguem a mesma regra ("Código aberto, conta grátis, tudo permanece local").
5. **Codex e OpenCode rebaixados para "em breve"**, não apagados: card Multi-agente e `pricing.included` passam a *"Claude Code hoje · Codex e OpenCode em breve"* (EN: *"Claude Code today · Codex and OpenCode coming soon"*). Trocar para remoção é uma linha se o founder preferir.
6. **`PRD.md` na raiz** é o documento de posicionamento (não `docs/POSITIONING.md`), porque é o anchor que o tooling do repo já espera. Conteúdo mínimo: posicionamento (promessa, segmento, contra o quê, vizinhos), ICP e o "operator", tese de PMF com os três sinais numéricos, o que precisa existir para atingi-la (na ordem), riscos, e a **régua de copy: nunca prometer o que o onboarding nega**.
7. **Sinais de PMF fixados no PRD** (medidos com design-partners antes de qualquer campanha): ≥40% "ficaria muito decepcionado sem" (Sean Ellis); retenção semana-4 ≥50% dos que ativaram (checklist completo + primeira issue respondida); ≥30% dos novos installs originados de um grupo onde o codm já respondia.
8. PT é a língua-fonte do copy; EN espelha 1:1 as mesmas chaves. `footer.headline`, `howItWorks` e `useCases` ficam como estão.

## User Stories

- **Story 1:** Como dev que atende clientes pelo WhatsApp, quero entender na dobra da landing que o codm resolve o pedido que meu cliente manda no grupo, para decidir em segundos se vale baixar.
  - Given a landing em PT ou EN, when leio o hero, then a promessa é a da Decision 2 (mecanismo sem ator fixo), sem nome de ferramenta. (AC-1, AC-2)
- **Story 2:** Como visitante avaliando o preço, quero que a landing diga exatamente o que o onboarding vai exigir de mim, para não descobrir uma conta obrigatória depois do download.
  - Given a seção de preço, when leio chips e explicação, then encontro "conta grátis · sem cartão" e nenhuma ocorrência de "sem conta". (AC-3)
  - Given o console recém-instalado, when vejo o rodapé e o primeiro slide do onboarding, then a mesma promessa vale lá. (AC-4)
- **Story 3:** Como visitante, quero saber quais agentes funcionam hoje, para não instalar esperando Codex/OpenCode.
  - Given o card Multi-agente e a lista "O que está incluído", when leio, then Claude Code é "hoje" e Codex/OpenCode são "em breve". (AC-5)
- **Story 4:** Como dev mantendo o produto, quero um `PRD.md` que fixe segmento, promessa e sinais de PMF, para que specs futuras (funil, uso por cliente, novos canais) partam da mesma tese.
  - Given `/brainstorm` de uma feature futura, when procuro o contexto de produto, then `PRD.md` existe na raiz com as seções da Decision 6. (AC-6, AC-7)

## Acceptance Criteria

- [ ] AC-1: `home.pt.json` e `home.en.json` têm o hero da Decision 2 em `hero.titleBold`, `hero.titleLight` e `hero.subtitle`, e nenhuma das strings "Claude Code", "Codex", "OpenCode", "pasta de projeto"/"project folder", "skills" nesses três campos (os `hero.cards` são o mock visual — prova, não promessa — e ficam como estão).
- [ ] AC-2: `howItWorks`, `useCases` e `footer.headline` permanecem byte-a-byte iguais nos dois locales.
- [ ] AC-3: `grep -riE 'sem conta|no account|not exist.*account|não existe conta' packages/app/astro/src` retorna zero linhas; `pricing.chipNoAccount` = "conta grátis · sem cartão" / "free account · no card"; `pricing.explanation` menciona que a conta é grátis e só identifica o usuário.
- [ ] AC-4: `grep -riE 'sem conta|no account' packages/app/react/src/locales` retorna zero linhas; `console.footerNoAccount` e `onboarding.slide1Body` seguem a Decision 4 em pt e en.
- [ ] AC-5: o card `capabilities` de tag "Multi-agente"/"Multi-agent" e `pricing.included[1]` dizem "Claude Code hoje · Codex e OpenCode em breve" / "Claude Code today · Codex and OpenCode coming soon" nos dois locales.
- [ ] AC-6: `PRD.md` existe na raiz com as seções: Posicionamento, ICP & operador, Tese de PMF (com os três sinais da Decision 7), O que falta para o PMF (ordenado), Riscos, Régua de copy, Vizinhos & concorrentes (OpenClaw).
- [ ] AC-7: `PRD.md` não cita nenhuma feature como existente que não exista hoje (Codex/OpenCode runner, Windows, Telegram, métricas de funil aparecem apenas em "O que falta").
- [ ] AC-8: `bun x nx run app-astro:build` e os testes existentes de `app-react` que leem locales passam após a edição (chaves não mudam, só valores).

## Inspirations & Research

- OpenClaw — https://openclaw.ai e https://docs.openclaw.ai — tagline *"The AI that really does things"*, público *"developers and power users who want a personal AI assistant they can message from anywhere"*. Usado para fixar a fronteira "assistente pessoal ≠ roteador de issues de código" (Decision 3).
- Críticas recorrentes ao OpenClaw nas listas de alternativas (hospedar você mesmo, setup técnico) — informam o argumento "DMG + QR + 3 passos" como diferencial de distribuição, registrado no PRD como vantagem a proteger (time-to-first-wow).

## Riscos (registrados no PRD, fora do escopo desta spec)

- **macOS-only** reduz o teto do segmento (parcela relevante de devs freelancers BR em Windows/Linux).
- **WhatsApp não-oficial (whatsmeow):** risco de banimento do número — que é o número do dev com os clientes. O onboarding deveria recomendar número dedicado; motiva Telegram como segundo canal cedo.
- **Reputação no grupo do cliente:** uma resposta errada do agente queima o dev, não o codm. O gate de aprovação e o sussurro são a defesa; qualquer afrouxamento deles é decisão de produto, não de UX.

## Open Questions

- Nenhuma bloqueante. Codex/OpenCode "em breve" vs remoção é uma troca de uma linha (Decision 5).

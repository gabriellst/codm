# i18n das mensagens que saem no canal — Design Spec

**Date:** 2026-08-04
**Status:** Draft
**Bounded Context:** cross-context: `thread` (catálogo + entrega), `owner` + `shared` (transporte do idioma)
**Kind:** feature
**Story Points:** 5 — um contexto de ponta a ponta (`thread`: catálogo novo, tabela declarativa, handler, testes) mais um campo na porta de kernel e sua implementação em `owner`; sem migration, sem contrato cross-service, sem projection

## Context

O produto fala com o operador em dois lugares: o **console** e o **canal** (WhatsApp). No console vale o padrão da casa — o backend emite código/estrutura e o app traduz (`GlobalErrorMapper` → `errors.*` em `packages/app/react/src/locales/{pt,en}.json`). No canal esse padrão não alcança: quem renderiza é o WhatsApp, e nenhum `t()` roda ali.

O mecanismo de catálogo server-side **já está portado** em `packages/api/typescript/src/shared/i18n/messages.ts` — `defineMessages`, `resolveLanguage`, `CATALOG_LANGUAGES` —, espelhando `packages/api/src/shared/i18n/messages.ts` do medscall e sua skill `.claude/skills/i18n-messages`. Ele tem **zero chamadores**: nenhum `<ctx>/i18n/` existe no codm.

O transporte do idioma também está pela metade. `shared/services/OwnerDirectory` existe — o docblock diz *"Port of the medscall@f04e8a0f owner-context design"* — mas o `OwnerTenancy` que ele devolve tem só `{ kind, responsibleUserId }`. No medscall a identidade carrega `language`; aqui não. O idioma existe e é editável (`auth/entities/UserProfile.ts`, `language: z.instance(LanguageTag).optional()`), só não viaja.

Já existe texto de canal que **nós autoramos**, e ele está em inglês fixo: `thread/handlers/RecordStopFromExecution.ts:8` declara `STOP_TITLES: Record<StopKind, string>` com entradas como `'Server error — the agent hit an API limit or outage'`. Foi exatamente esse título que apareceu no banco quando dois stops nasceram em 2026-08-04.

A costura de eventos para stops já está inteira: `AgentRunStopRaisedEvent` (domain, `agent`) → `PublishAgentIntegrationEvents` → `ThreadStopRaisedEvent` (integration) → `RecordStopFromExecution` (`thread`). E existe caminho mecânico de entrega no canal que **não passa por agente**: `thread/usecases/RecordOrchestratorReply.ts` escreve a entrada `SYSTEM` no transcript e enfileira a entrega como comando durável, na mesma transação.

## Problem

1. **O operador não é avisado quando o agente não consegue avisar.** Em 2026-08-04 dois stops `SERVER_ERROR` nasceram às 21:23 com o detalhe *"You've hit your session limit · resets 10:30pm"*. O registro ficou correto no banco e no painel *Needs-you* do console — e nada chegou ao canal. A última fala do orquestrador foi 21:14:44. O único canal que fala com o operador longe do computador depende do agente, e a classe de erro mais importante é justamente aquela em que o agente não pode falar.

2. **O texto que temos é monolíngue e está fora de qualquer catálogo.** `STOP_TITLES` é uma tabela inglesa embutida num handler. O operador pode escolher o idioma na conta, e essa escolha não alcança nada do que sai no canal.

3. **O mecanismo de i18n existe e não é usado.** `shared/i18n/messages.ts` foi portado e nunca ganhou um consumidor, então a decisão de como o idioma viaja até um ponto de emissão continua em aberto — e cada nova superfície de canal vai reabri-la.

## Goal

Quando o agente não consegue falar, o produto fala por ele: um stop de falha vira uma mensagem no canal, no idioma que o operador escolheu, entregue por um caminho que não depende de nenhum agent runner. E o primeiro catálogo de contexto passa a existir, com um consumidor real, fixando como o idioma viaja para todas as superfícies de canal que vierem depois.

## Decisions

1. **O idioma é o do operador**, alcançado pela porta que já existe: `OwnerTenancy` ganha `language`, resolvido de `UserProfile.language` pelo `responsibleUserId` que a identidade já carrega. Espelha o medscall e fecha o port pela metade. Não se cria campo de idioma na `Thread` — hoje a thread é o operador falando com o próprio agente, e modelar idioma por conversa seria modelar um caso que não existe.

2. **A conversão de `LanguageTag` para `Language` é direta, sem tabela de-para.** Os valores do enum `Language` **são** tags BCP-47 (`PT_BR: "pt-BR"`, `EN_US: "en-US"`), então o valor do value object é passado ao `resolveLanguage`, que já colapsa qualquer tag fora do catálogo em `DEFAULT_LANGUAGE`. Um operador com `fr-CH` recebe português, e nenhum chamador ramifica sobre idioma.

3. **O primeiro catálogo é `thread/i18n/messages.ts`**, na forma que a skill do medscall define: PT como catálogo de referência, TS obrigando o EN a declarar as mesmas chaves, mensagens como funções (params tipados no call site), export ALL_CAPS `THREAD_MESSAGES`. O mecanismo continua em `shared/i18n` sem vocabulário de domínio.

4. **`STOP_TITLES` sai do handler e vira entrada do catálogo.** Não é copy nova: é a mesma frase, agora com par em português e alcançável pelo idioma do operador.

5. **A mensagem no canal é a nossa frase pelo `StopKind` mais o `detail` do provider verbatim.** O kind é vocabulário nosso e traduz; o `detail` foi escrito pelo Claude (*"You've hit your session limit · resets 10:30pm"* não existe no nosso código) e vai sem tradução, como diagnóstico. Não se constrói classificador sobre string de erro de terceiro — quebraria em silêncio quando o provider mudasse o texto. A informação mais acionável do episódio de 2026-08-04 — o horário do reset — estava justamente no `detail`, então escondê-lo perderia o essencial.

6. **Só notificam os stops que o orquestrador não conseguiria ter contado.** `SERVER_ERROR` (o turno morreu), `AUTH_REQUIRED` (o CLI pede login e a sessão não anda) e `BLOCKED_BY_CLASSIFICATION` (a resposta do agente foi barrada, então o operador não ouviu nada) notificam. `HUMAN_REQUESTED` e `APPROVAL_NEEDED` **não**: nascem de um turno que rodou e falou pela própria voz, e uma notificação mecânica duplicaria a fala.

7. **Essa escolha vive numa tabela declarativa sobre `StopKind`, não num `if`.** O contexto já tem duas irmãs, ambas `Record<StopKind, …>`: `RESOLUTIONS_BY_KIND` em `thread/utils/StopResolutions.ts:13` e `POLICY_KEY` em `thread/usecases/RaiseStop.ts:26`. E o CLAUDE.md proíbe desvio de fluxo sobre caso particular quando a informação cabe num contrato declarado. Um kind novo no enum quebra a compilação até declarar se notifica.

8. **A entrega reusa o caminho mecânico que já existe** — entrada `SYSTEM` no transcript mais comando durável, como `RecordOrchestratorReply` faz. Nenhum agent runner participa, que é a propriedade que motiva a spec inteira.

## User Stories

- **Story 1:** Como operador longe do computador, quero ser avisado no WhatsApp quando o agente travou, para não descobrir horas depois que nada andou.
  - Given um stop `SERVER_ERROR` nascendo numa thread minha, when o handler o registra, then uma mensagem chega ao canal com a explicação no meu idioma e o detalhe do provider anexado.
  - Given que meu perfil está em `en-US`, when o mesmo stop nasce, then a mensagem chega em inglês.
  - Given que meu perfil está vazio ou num idioma que o catálogo não tem, when o stop nasce, then a mensagem chega em português.

- **Story 2:** Como operador, quero que perguntas do agente não virem notificação duplicada, para o canal não virar ruído.
  - Given um stop `HUMAN_REQUESTED`, when o handler o registra, then nenhuma mensagem mecânica é enfileirada — o agente já falou por conta própria.

- **Story 3:** Como desenvolvedor adicionando um `StopKind`, quero que o compilador me obrigue a dizer se ele notifica, para a decisão não ficar implícita.
  - Given um membro novo em `StopKind`, when eu compilo sem declará-lo na tabela, then `tsc` falha.

## Acceptance Criteria

- [ ] AC-1: `OwnerTenancy` carrega `language`, resolvido de `UserProfile.language` do `responsibleUserId`; um owner cujo responsável não tem idioma definido devolve o campo ausente.
- [ ] AC-2: Um stop `SERVER_ERROR` numa thread enfileira exatamente uma entrega no canal, com entrada `SYSTEM` no transcript, sem invocar nenhum agent runner.
- [ ] AC-3: A mensagem entregue contém a frase do catálogo no idioma do operador **e** o `detail` do provider sem tradução.
- [ ] AC-4: Com o operador em `en-US` a frase sai em inglês; com idioma ausente ou fora do catálogo (ex.: `fr-CH`), sai em português.
- [ ] AC-5: `HUMAN_REQUESTED` e `APPROVAL_NEEDED` não enfileiram entrega alguma; `SERVER_ERROR`, `AUTH_REQUIRED` e `BLOCKED_BY_CLASSIFICATION` enfileiram.
- [ ] AC-6: A decisão de notificar é lida de uma tabela `Record<StopKind, …>` — nenhum `if` sobre valor de kind no caminho de entrega.
- [ ] AC-7: `STOP_TITLES` deixa de existir como tabela inglesa no handler; os mesmos títulos vivem no catálogo com par em português.
- [ ] AC-8: O catálogo `THREAD_MESSAGES` declara as mesmas chaves em `pt-BR` e `en-US`; remover uma chave do catálogo EN quebra a compilação.

## Riscos

**Volume de notificação.** Esta spec faz stops de falha virarem mensagem no seu WhatsApp. Se um provider instável levantar `SERVER_ERROR` repetidamente, cada um vira uma mensagem. A Decisão 6 já corta a maior fonte de ruído (perguntas do agente), mas não há supressão por repetição — dois stops idênticos em sequência mandam duas mensagens. Aceito conscientemente: preferível a errar para o lado do silêncio, que é o defeito que a spec existe para corrigir. Se virar problema, o endereço é dedup por `dedupKey` do comando, não mudar a regra de quais kinds notificam.

## Open Questions

- **O vigia continua fora.** Esta spec cobre o caminho síncrono — stop nasce, você é avisado. Não cobre "algo apodreceu e ninguém percebeu": item de mailbox envenenado (que hoje não levanta stop nenhum), issue `WORKING` sem trabalho na fila, stop aberto há horas sem resposta. Isso é uma spec própria, e ela vai reusar o catálogo e o transporte que esta cria.
- **O segundo cue do canal.** `thread/utils/ChannelCues.ts` antecipa um cue para *"the turn ended and it needs you"* com emoji ainda não escolhido pelo founder. Não é escopo aqui, mas quando existir vai querer o mesmo catálogo.

# SPEC — Union slots de provider no contrato (declaração única, forma com o dono, união em codegen)

Status: **RATIFICADO** (founder, 2026-07-22 — três decisões em sequência: declaração única nos
contracts; owner explícito resolvido pelo manifest; união completa em toda superfície emissora).
Baseline: o padrão `@union/@variant` do medscall channel (verbatim em `packages/api/go`,
`internal/channel/events/message_received.go`) + o pipeline openapi `pkg/openapi` (scanner AST).

## 1. Problema

Eventos como `channel.message_received` carregam payloads cuja forma varia por provider
(`WhatsAppTextContent`, `WhatsAppPollContent`, futuro `TelegramTextContent`). Três forças em tensão:

1. **Declaração única** — no codedm todo evento de integração é declarado UMA vez, em
   `packages/contracts`. Redeclarar o payload no Go para carregar anotações = duas fontes de
   verdade (o modelo medscall, onde o Go é a fonte, viola isso).
2. **Formas são detalhe de provider** — adicionar um campo no poll do WhatsApp ou nascer o adapter
   Telegram NÃO pode exigir emenda de contrato; a forma evolui com o adapter.
3. **Tipagem rica ponta a ponta** — SDK/console precisam de uniões discriminadas completas
   (narrowing por `platform`+`messageType`), em toda superfície que emite (HTTP, SSE, dos dois
   backends).

## 2. Design

### 2.1 Contrato: estrutura + nomes + donos — nunca formas

```typespec
// packages/contracts/wire/events/channel-message-received.tsp
@unionSlot("content", #["platform", "messageType"])
@variant("WHATSAPP", "TEXT",     "WhatsAppTextContent",  #{ owner: "apiGo" })
@variant("WHATSAPP", "IMAGE",    "WhatsAppImageContent", #{ owner: "apiGo" })
@variant("WHATSAPP", "POLL",     "WhatsAppPollContent",  #{ owner: "apiGo" })
@unionSlot("platformData", #["platform"])
@variant("WHATSAPP", "WhatsAppMessageReceivedPlatformData", #{ owner: "apiGo" })
model ChannelMessageReceivedEvent {
  ...EnvelopeFields;
  channelId: string; messageId: string; platform: ChannelKind; messageType: MessageType;
  content?: unknown;        // slot opaco — a união materializa em codegen
  platformData?: unknown;
}
```

Regras:
- `owner` é um **id da tabela WORKSPACES** do `template.config.ts`. Owner inexistente = **erro de
  compilação do contrato** (validação no codegen contra o manifest).
- Os **enums discriminadores** (`ChannelKind`, `MessageType`) são material de contrato — conjuntos
  fechados, congelados, como sempre.
- Adicionar variante = 1 linha `@variant` (o contrato registra QUE ela existe e QUEM a possui).
  Mudar a FORMA de uma variante existente não toca o contrato.

### 2.2 Codegen: estampagem no binding gerado

O codegen ts+go dos contracts, ao emitir o binding Go do evento
(`packages/contracts/generated/go/wire/events.go`), **estampa os comentários** `// @union ...` /
`// @variant ...` no struct gerado — sintaxe idêntica à do medscall. Consequência: o scanner AST
verbatim (`pkg/openapi`) funciona **sem alteração**; encontra as anotações no binding gerado em vez
de num struct manual. Zero redeclaração: o Go importa o binding, as formas moram no adapter.

No lado TS, o binding gerado exporta além do schema do evento um **manifest de união**
(`ChannelMessageReceivedUnions`: slot → discriminadores → [{valores, nomeDoTipo, owner}]) para
consumo do rail e da composição (2.4).

### 2.3 Formas: sempre no serviço dono

- `WhatsAppTextContent` etc. vivem em `packages/api/go/internal/channel/...` (colados no
  adapter/eventos, como no verbatim). Um futuro gateway Rust teria as dele.
- A **emissão OpenAPI do dono** materializa o schema concreto: `pkg/openapi` resolve cada nome de
  variante nos pacotes do workspace dono e emite `oneOf` + `discriminator` (+ `x-` metadata dos
  discriminadores compostos, como o medscall já faz).
- Kubb consome o openapi do dono → SDK ganha os tipos + **schemas zod por variante**
  (`whatsAppTextContentSchema`...). Esses schemas gerados são a ÚNICA forma pela qual outros
  serviços conhecem as formas.

### 2.4 União completa em TODA superfície emissora

- **Go**: qualquer response/SSE cujo tipo carrega slot de união (ex.: `listen_events`) emite o
  `oneOf` completo no openapi do gateway — automático via scanner + anotações estampadas.
- **TS**: endpoints do daemon que re-emitem esses eventos (ex.: `ui/ListenEvents`) compõem o output
  schema com `z.discriminatedUnion` **importando os schemas zod gerados do client do dono**
  (`@codedm/client-.../gateway`), nunca redeclarando. O emitter openapi TS (discriminador const,
  convenção da casa) publica a união completa no openapi do daemon → SDK do console tem narrowing
  idêntico nas duas origens.
- Cadeia canônica: forma no dono → openapi do dono → schema gerado → composição nos consumidores →
  openapi dos consumidores → SDK final. **Um shape, N superfícies, zero redeclaração.**

### 2.5 Runtime: validação e forward-compat

- O **dono valida** suas formas na borda (como o verbatim já faz).
- Consumidores validam opportunisticamente com os schemas gerados APENAS das variantes que
  consomem (ex.: classificação lê `WhatsAppTextContent`); todo o resto é passthrough opaco.
- **Regra de forward-compat**: consumidor que encontra valor de discriminador desconhecido trata o
  slot como opaco (log + passthrough), nunca rejeita o evento — variantes novas não podem quebrar
  consumidores antigos.

## 3. Rail `union-parity` (tests/architecture)

Três checks, todos mecânicos:
1. **Resolução no dono**: todo nome de `@variant` resolve para um tipo real no workspace dono —
   resolver por linguagem, plugável (v1: Go = scan AST via a mesma infra do pkg/openapi; TS =
   schema zod exportado com o nome; nova linguagem = novo resolver, padrão `detectLang`).
2. **Emissão completa**: todo endpoint (Go e TS) cujo response carrega slot de união tem o `oneOf`
   completo (todas as variantes declaradas) no openapi emitido.
3. **Sem redeclaração**: nenhum workspace não-dono declara tipo com nome de variante alheia;
   consumo cross-service só via binding gerado (grep de imports).

## 4. Migração do estado atual (verbatim)

O verbatim carrega os payloads declarados NO GO com anotações manuais (estilo medscall). Migração
por evento, mecânica: 1) declarar o evento + `@unionSlot/@variant` no `.tsp` (campos estáveis do
struct verbatim); 2) codegen (binding estampado); 3) o Go troca o struct local pelo binding
importado (as FORMAS das variantes ficam onde estão); 4) rail verde. Ordem: `message_received`
primeiro (o mais rico), depois `gateway_platform_event`, `connected/disconnected/logged_out`.

## 5. Implementação (ordem)

1. Decorators TypeSpec (`@unionSlot`, `@variant`) + validação de owner contra o manifest.
2. Codegen: estampagem Go + manifest de união TS (+ testes de regressão no codegen, padrão dos
   testes de arrays/digit-enums).
3. Migração do `message_received` (piloto ponta a ponta: contrato → binding → openapi → SDK).
4. Composição TS do `ListenEvents` com schemas gerados.
5. Rail union-parity (3 checks) em tests/architecture + entrada no test:tooling.
6. Migração dos demais eventos anotados; doc no `docs/BACKEND.md` (seção "Union slots").

## 6. Não-objetivos

- Versionamento de variante (a forma evolui com o adapter; consumidores toleram desconhecido).
- Variantes cross-language para o MESMO valor de discriminador (um valor = um dono).
- Modelar formas de provider no TypeSpec (explicitamente proibido por este spec).

## 7. Aceite

- `message_received` migrado: contrato declara, Go importa binding, openapi do gateway com oneOf
  completo, SDK com narrowing, `ListenEvents` TS compondo schemas gerados, rail verde nos 3 checks,
  diff do verbatim continua mecânico (imports/nomes apenas).

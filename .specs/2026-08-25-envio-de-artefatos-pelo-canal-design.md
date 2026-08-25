# Envio de artefatos pelo canal (agente → contato) — design

**Status:** Approved (founder, 2026-08-25)
**Contextos:** agent · artifact · thread · channel (Go)
**Precedentes:** `.specs/2026-08-06-preview-de-artefatos-na-conversa-design.md` (artefato = saída do agente, preview no console) · mídia inbound (commits a72323a5/03d6e114: `mediaPath`, `<CODM_DATA_DIR>/media/<sha256>.<ext>`, gramática `arquivo=`) · `.specs/2026-07-29-mcp-core-service-design.md` (tool = controller com `mcpScopes`) · `SendDirectMessage` (tool → `deliver_channel_message`) · `.specs/2026-08-25-thinking-indicator.md` (claim do eco `fromMe` no `ConsumedMessageRepository`).

## Context

Hoje o agente **recebe** mídia do contato (o gateway baixa para `<CODM_DATA_DIR>/media/`, a entry carrega `mediaPath`, o prompt entrega o path via `arquivo="…"`) e **produz** artefatos (tool `mcp__codm__RecordArtifact`: `kind` + `ref` = path local; preview no console via `GET /threads/:t/artifacts/:a/content`). Mas o artefato **para no console**: nada leva um arquivo do agente até o contato pelo canal.

O gateway Go já sabe enviar mídia (`POST /api/messaging/messages/{image,video,audio,file}` → `client.Upload` + `ImageMessage`/`DocumentMessage`), e a SDK TS desses endpoints já está gerada — sem nenhum chamador. A porta TS `ChannelSender` é texto-only (`send/edit/react/signalTyping`).

## Problem

O agente não tem como entregar um arquivo (imagem, documento, áudio, vídeo) ao contato. A resposta em texto é o único canal de saída; um relatório, um print ou um PDF gerados durante uma tarefa ficam presos na máquina, visíveis só no console.

## Goal

O agente, durante um run, escolhe um artefato já registrado e o entrega no canal da conversa como mídia nativa (imagem com legenda, documento com nome de arquivo, áudio, vídeo). O envio aparece no console como bolha de artefato do lado do agente, e o eco do WhatsApp não vira mensagem do dono do canal.

## Decisions

1. **Exposição por tool MCP explícita, não por sentinela no texto.** `mcp__codm__SendArtifact` (controller `POST /threads/:threadId/artifacts/:artifactId/send`, `mcpScopes = [ISSUE_HANDLING]`, body `{ caption?: string }`). Motivo: a resposta streamada vai crua ao canal a cada cut e só `[quote: …]` é parseado — e só no fim; uma sentinela vazaria no meio do stream ou exigiria um segundo parser por corte. Tool é auditável e reusa o rail provado do `SendDirectMessage`.
2. **`SendArtifact` é separada de `RecordArtifact`.** Registrar ≠ entregar: a entrega pode falhar/repetir e o mesmo use case serve um futuro botão "enviar ao contato" no console (fora de escopo aqui). Fluxo do agente: escreve o arquivo → `RecordArtifact` → `SendArtifact(artifactId, caption?)`.
3. **Bytes até o gateway por path local restrito ao media dir (simétrico do inbound).** O daemon copia o arquivo do artefato para `<CODM_DATA_DIR>/media/<sha256>.<ext>` (content-addressed, escrita atômica — mesmo layout que o gateway já usa) e passa `mediaPath` ao gateway. O gateway aceita `mediaPath` nos endpoints de envio **somente** se o path canônico (`filepath.EvalSymlinks` + `Abs`) estiver sob o media dir dele; qualquer outro path → 400 `MEDIA_PATH_NOT_ALLOWED`. `mediaUrl` (`http(s)`/`data:`) continua aceito; `mediaPath` e `mediaUrl` são mutuamente exclusivos (exatamente um). Sem hop HTTP loopback, sem inflação base64.
4. **Entrega durável por command `deliver_channel_attachment`** (outbox), espelhando `deliver_channel_message`: payload `{ ownerId, threadId, artifactId, mediaPath, kind, caption?, fileName?, mimeType? }`; handler chama `ChannelSender.sendMedia`, e **imediatamente após o envio reivindica o `messageId` no `ConsumedMessageRepository`** (o eco `fromMe` do WhatsApp chega como inbound; sem o claim vira mensagem do dono do canal — a mesma classe de bug do placeholder "Pensando"). Depois grava a transcript entry (`kind = AGENT`, `text = caption ?? ''`, `mediaPath`, `artifactId`) e linka o entry ao ledger como `recordOutbound` faz.
5. **Porta:** `ChannelSender` ganha `sendMedia(input: SendChannelMediaInput): Promise<{ messageId }>` e `capabilities.media: boolean`. `GatewayChannelSender` despacha por `ArtifactKind`: `IMAGE → sendImage(mediaPath, caption)`, `VIDEO → sendVideo`, `AUDIO → sendAudio` (não-PTT), `FILE → sendFile(mediaPath, fileName, mimeType)`. `LINK` não é mídia: o use case envia texto (`caption + "\n" + url`) pelo `deliver_channel_message` existente. `MockChannelSender`/mock do registry capturam as chamadas para testes.
6. **Tetos e erros nomeados (ApplicationErrors, checados no use case antes de enfileirar):** `ARTIFACT_NOT_FOUND` (404), `ARTIFACT_FILE_MISSING` (422, `ref` não existe no disco), `ARTIFACT_TOO_LARGE` (413; IMAGE/VIDEO/AUDIO 16 MiB, FILE 64 MiB — o teto de inbound do gateway), `CHANNEL_MEDIA_UNSUPPORTED` (409, `capabilities.media = false`). `mimeType` por extensão (mesma tabela do `GetArtifactContent`); `fileName` = basename do `ref`.
7. **Prompt do orquestrador** ganha a instrução (bloco de ferramentas do escopo `ISSUE_HANDLING`): "Para entregar um arquivo ao contato, registre-o com `RecordArtifact` e envie com `SendArtifact` — imagens vão como foto (com legenda), demais como documento". Sem isso a tool existe e o modelo não a descobre.
8. **Console:** a entry gravada em (4) já tem a forma que `TranscriptArtifact` renderiza (artefato numa bolha, lado do agente). Não há tela nova; a aba "Artefatos" continua listando o artefato uma vez.
9. **Fora de escopo:** botão "enviar ao contato" no console; envio de mídia pelo operador humano (`SendDirectMessage` continua texto); sticker; reenvio automático em falha do gateway (o command falha alto, como `deliver_channel_message`).

## User Stories

- **US-1 (agente):** Ao concluir uma tarefa que gerou um PDF, eu registro o artefato e o envio ao contato pelo WhatsApp como documento, com uma legenda curta — sem sair do run.
- **US-2 (contato):** Recebo a imagem/documento como mídia nativa do WhatsApp (abre inline), com a legenda do agente, na mesma conversa.
- **US-3 (operador, console):** Vejo na conversa a bolha do artefato enviado, do lado do agente, e não uma mensagem "minha" duplicada vinda do eco.
- **US-4 (segurança):** O gateway só serve arquivos do seu próprio media dir — um path arbitrário passado por engano ou abuso é recusado.

## Acceptance Criteria

- **AC-1** `mcp__codm__SendArtifact` aparece no snapshot de exposição MCP no escopo `issue-handling`; o prompt do orquestrador descreve o par `RecordArtifact` → `SendArtifact`.
- **AC-2** Enviar um artefato `IMAGE`: o arquivo é copiado para `<CODM_DATA_DIR>/media/<sha256>.<ext>`, o gateway recebe `sendImage({ mediaPath, caption })`, o `messageId` devolvido é reivindicado no ledger de consumidas **antes** de a entry ser gravada, e a entry `AGENT` com `mediaPath` + `artifactId` existe na thread.
- **AC-3** O eco `fromMe` do envio, replicado por `ConsumeInboundMessage`, **não** cria entry (mesmo teste de regressão do placeholder "Pensando", adaptado).
- **AC-4** `FILE` vai como documento com `fileName` = basename e `mimeType` por extensão; `AUDIO`/`VIDEO` pelos endpoints respectivos; `LINK` sai como texto pelo `deliver_channel_message`.
- **AC-5** Tetos: artefato acima do limite do seu kind → `ARTIFACT_TOO_LARGE` sem enfileirar; `ref` inexistente → `ARTIFACT_FILE_MISSING`; canal sem `capabilities.media` → `CHANNEL_MEDIA_UNSUPPORTED`.
- **AC-6** Gateway: `mediaPath` fora do media dir (inclusive via symlink) → 400 `MEDIA_PATH_NOT_ALLOWED`; `mediaPath` e `mediaUrl` juntos ou ambos ausentes → 400 de validação; `mediaPath` válido → upload e envio (teste Go com media dir temporário).
- **AC-7** E2E (roteiro 13/91 como molde): um run que chama `SendArtifact` com uma imagem resulta em `sendImage` observado no overlay do canal de teste, entry na thread, zero entry `CONTACT` espúria.
- **AC-8** Gates: `bun contracts` (se tocar TypeSpec), `bun sdk`, tsc/lint/test dos dois backends, `db:check-go` se houver migração (não deve haver: a entry reusa `media_path` e ganha `artifact_id` só se a coluna não existir — verificar), snapshot MCP atualizado.

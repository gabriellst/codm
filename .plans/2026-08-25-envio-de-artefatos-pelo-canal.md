# Plano — envio de artefatos pelo canal (agente → contato)

**Spec:** `.specs/2026-08-25-envio-de-artefatos-pelo-canal-design.md` (Approved 2026-08-25)
**Contextos:** channel (Go gateway) · thread · artifact · agent · client (SDK)
**Ordem:** contrato primeiro (T1 → T2), depois as fatias TS (T3 → T5), depois prompt/e2e (T6 → T7). T1 e T3 podem andar em paralelo se o TS mockar a porta; o `bun sdk` de T2 é a barreira antes de T4 tocar o `GatewayChannelSender`.

## T1 — Gateway Go: `mediaPath` nos endpoints de envio (Decision 3, AC-6)
- `packages/api/go/internal/channel/controllers/send_{image,video,audio,file,media}.go` + use cases: request ganha `mediaPath string` (`json:"mediaPath,omitempty"`), validação "exatamente um de mediaUrl|mediaPath" (validator custom ou checagem explícita → 400).
- `services/gateway/whatsapp/message_builder.go`: `downloadMediaFromURL` vira `resolveMediaBytes(source)`: se `mediaPath`, canonicaliza (`filepath.Abs` + `EvalSymlinks`) e exige prefixo do media dir (`MediaStore.Dir()` — expor no `media_store.go`); fora → erro `MEDIA_PATH_NOT_ALLOWED` (400). Leitura com o mesmo teto de 64 MiB do inbound.
- Testes Go: path dentro (ok), fora (400), symlink apontando para fora (400), ambos/nenhum (400). `go build ./... && go test ./...`.
- `bun emit-openapi` para o `openapi.json` do Go refletir o campo.

## T2 — SDK: `bun sdk` (barreira)
- Regenera `packages/client/dist/{typescript,go,rust}`; confirmar `sendImage`/`sendFile`/… com `mediaPath` nos schemas zod. `bun tsc`.

## T3 — Porta TS: `ChannelSender.sendMedia` + `capabilities.media` (Decision 5)
- `thread/services/ChannelSender/ChannelSender.ts`: `SendChannelMediaInput { channelId, remoteId, kind: ArtifactKind (sem LINK), mediaPath, caption?, fileName?, mimeType? }`, `sendMedia(): Promise<{ messageId }>`, `ChannelCapabilities.media`.
- `GatewayChannelSender.ts`: despacho por kind → `sendImage/sendVideo/sendAudio/sendFile` da SDK do Go (mesmo `X-Owner-Id`/baseURL de `sendText`); `capabilities = { edit: true, media: true }`.
- Mock do registry (`mock`/`integration`): captura chamadas; `capabilities.media` configurável para o teste de `CHANNEL_MEDIA_UNSUPPORTED`.

## T4 — Use case `SendArtifact` + command `deliver_channel_attachment` (Decisions 2, 4, 6; AC-2..5)
- Erros: `ARTIFACT_FILE_MISSING`, `ARTIFACT_TOO_LARGE`, `CHANNEL_MEDIA_UNSUPPORTED` em `artifact/errors` (+ mapper global, chaves i18n en/pt).
- `artifact/services/MediaStore` (TS): `stage(ref) → { mediaPath, sha256, sizeBytes }` copiando para `<CODM_DATA_DIR>/media/<sha256>.<ext>` (escrita atômica `.part` → rename; idempotente se já existe). Tabela de mime por extensão compartilhada com `GetArtifactContent` (extrair para `artifact/services/mimeByExtension.ts`).
- `artifact/usecases/SendArtifact.ts`: carrega artefato (ownerId + threadId), valida kind/teto/arquivo/capability, `LINK` → enfileira `deliver_channel_message` com `caption\nurl`; demais → `stage()` e enfileira `deliver_channel_attachment`.
- `thread/usecases/DeliverChannelAttachment.ts` (handler do command, espelho de `DeliverChannelMessage`): `sender.sendMedia` → **claim imediato do `messageId` no `ConsumedMessageRepository`** → entry `AGENT` (`text = caption ?? ''`, `mediaPath`, `artifactId` — checar se `transcript_entries` já tem `artifact_id`; se não, migração `0021` + `db:sync-go`/`check-go`) → `linkEntry`.
- Testes colocados: use case (cada erro, cada kind, LINK como texto), handler (claim antes da entry; eco replicado por `ConsumeInboundMessage` não cria entry — copiar o teste do placeholder).

## T5 — Controller/tool MCP (Decision 1; AC-1)
- `artifact/controllers/SendArtifact.ts`: `POST /threads/:threadId/artifacts/:artifactId/send`, body `{ caption?: string }`, `static mcpScopes = [McpScope.ISSUE_HANDLING]`; registrar no barril; `bun sdk`; snapshot `agent/mcp/__snapshots__/exposure.test.ts.snap` atualizado (25 tools).

## T6 — Prompt do orquestrador (Decision 7)
- `agent/agents/OrchestratorAgent/prompt.ts`: instrução do par `RecordArtifact` → `SendArtifact` no bloco de ferramentas; teste de prompt existente atualizado (snapshot/asserção de texto).

## T7 — Console + E2E (Decision 8; AC-7)
- Verificar que `TranscriptArtifact` renderiza a entry `AGENT` com `mediaPath`/`artifactId` (se a bolha hoje depende só de `artifactId`, garantir o join no `GetSessionChat`); story com fixture do envio.
- `packages/e2e/tests/14-send-artifact.spec.ts` (molde: 13-thinking-indicator + 91-demo-thread-artifacts): run chama `SendArtifact` de uma imagem → overlay do canal de teste observa `sendImage`; entry na thread; zero `CONTACT` espúria. O overlay/testseam do gateway precisa aceitar `mediaPath` (T1).

## Validação final
`bun contracts` (só se TypeSpec mudar) · `bun sdk` · `bun tsc` · `bun lint` · `bun run test` · `go test ./...` · `db:check-go` · e2e 14 · snapshot MCP.

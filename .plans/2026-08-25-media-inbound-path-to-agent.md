# Mídia inbound: salvar arquivo + entregar path ao agente

**Decisão do founder (2026-08-25):** a plataforma NÃO interpreta mídia. Responsabilidade dela termina em (1) baixar e guardar o arquivo numa pasta durável e (2) entregar o path ao agente na gramática do prompt. A análise (ver imagem, ler PDF, transcrever áudio) é do agente com as ferramentas dele — "se não tiver as ferramentas, não é nosso problema". Sem whisper, sem ffmpeg, sem content blocks multimodais no stdin.

## Estado atual (mapeado em 2026-08-25)

- Go já emite `channel.message_received` com `messageType` AUDIO/IMAGE/VIDEO/DOCUMENT/STICKER, mas `extractMediaFields` (`packages/api/go/internal/channel/services/gateway/whatsapp/mapper/content.go:225`) descarta `mediaKey`/`directPath`/`fileSha256`/`fileEncSha256` — a `url` sobrevivente é um blob AES indecifrável, e o CDN do WhatsApp expira em ~14 dias.
- `client.Download` (whatsmeow) nunca é chamado no inbound. Zero storage de bytes.
- TS descarta não-TEXT em `ConsumeInboundMessage.ts:76` (`if (messageType !== TEXT) return`) — mídia nem vira entry.
- `thread_transcript_entries` só tem `text` (`packages/contracts/db/schema/thread.ts:122`); `gateway_messages` não tem coluna `message_type`.
- Agente = CLI `claude` headless; `Read` da CLI renderiza imagem e PDF nativamente — path basta.
- Padrão de referência para o store: `DiskContactAvatarStore` (content-addressed, sha256, write atômico `.part`→`rename`, em `$CODM_DATA_DIR/avatars/`).

## Desenho

```
whatsmeow events.Message (mídia)
  → Go: extrai descriptor completo (chaves ficam in-process, NÃO entram no contrato)
  → Go: client.Download → $CODM_DATA_DIR/media/<sha256>.<ext>  (atômico; falha ⇒ segue sem path)
  → evento channel.message_received: variante de mídia ganha mediaPath (absoluto) no content
  → TS ConsumeInboundMessage: ingere entry (kind CONTACT) com messageType/mediaPath/mimetype
  → gramática: <msg de="…" tipo="audio" arquivo="/…/media/ab12….ogg" duracao="0:12">caption?</msg>
  → system prompt: "msg com arquivo= referencia arquivo em disco; use suas ferramentas para analisá-lo"
  → turno enfileirado normalmente (mesmo gate canInvoke de texto — nada espera análise)
```

Pasta de arquivos salvos: **`$CODM_DATA_DIR/media/`**, content-addressed (`sha256(bytes)` + extensão por mimetype), escrita SOMENTE pelo gateway Go; TS e agente só leem. Dedup de graça (mesmo arquivo reencaminhado = mesmo path). Retenção: manter tudo por ora (item aberto).

## Tarefas (ordem)

1. **Contrato (Phase-0 lock)** — `packages/contracts/wire/events/channel-message-received.tsp`: variantes IMAGE/VIDEO/AUDIO/DOCUMENT/STICKER ganham `mediaPath?: string` (mantêm mimetype/fileName/seconds/ptt/caption já existentes). `bun contracts` + `bun sdk`. NUNCA expor mediaKey/hashes no contrato.
2. **Go — captura + download**: `extractMessageContent` passa a reter os campos de decriptação in-process; novo `MediaStore` (espelho do avatar store) em `$CODM_DATA_DIR/media/`; `client.Download` no handler de mensagem; popular `mediaPath` no content persistido/emitido. Falha de download ⇒ evento sem `mediaPath` (nunca bloqueia a mensagem).
3. **Go — coluna `message_type`** em `gateway_messages` (hoje o tipo é calculado e descartado). `bun migrate:create` + `db:sync-go` + `db:check-go`.
4. **TS — ingestão**: remover guard não-TEXT em `ConsumeInboundMessage.ts:76`; `thread_transcript_entries` ganha `messageType`, `mediaPath`, `mimetype` (colunas na própria tabela; 1:1, sem tabela filha); `IngestChannelMessage` propaga; caption vira `text` quando existir, senão placeholder curto (`[áudio 0:12]`, `[imagem]`, `[documento nota.pdf]`).
5. **TS — prompt/gramática**: `WindowEntrySchema`/`OperatorMessageItemSchema` (`OrchestratorAgent/types.ts`) + `MsgBlock` (`grammar.ts`) ganham os campos; render com atributos `tipo=`/`arquivo=`/`duracao=`; instrução no system prompt do `OrchestratorPromptBuilder`. Garantir acesso da CLI à pasta: incluir `$CODM_DATA_DIR/media` no `--add-dir` (`ClaudeAgentRunner.buildArgs`).
6. **Testes**: unit do MediaStore (Go), teste do consume com mídia (entry criada, turno enfileirado, degradação sem path), snapshot da gramática com `arquivo=`.

## Fora de escopo (explícito)

- Transcrição de áudio / OCR / extração de frames — responsabilidade do agente.
- Envio de mídia pelo agente (ChannelSender TS só tem sendText; PTT sempre false no builder Go) — gap separado.
- Retenção/GC da pasta media e limite de tamanho de download — decidir depois (default: baixa tudo, mantém tudo).
- Stories/broadcast continuam descartados.

## Consequência aceita

Com a CLI `claude` pura, imagem e PDF são analisados de verdade (Read nativo); áudio/vídeo o agente vê o path + duração mas não "ouve" — reage ("recebi seu áudio…") ou usa ferramenta que o operador tiver instalado (MCP/skill). Decisão consciente do founder.

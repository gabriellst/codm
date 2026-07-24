# OVERNIGHT REPORT — noite 23-jul-2026 (goal: OVERNIGHT-GOAL-2026-07-23.md)

## Placar
| Fase | Estado | Evidência |
|---|---|---|
| A — alinhamento backend | ✅ GREEN 90 | flat-events 13 commits (7918c10c..39ab647b): 16 swaps com wire-identity 22/22 byte-idêntica, 2 BLOCKED honestos (RemoteType/ChannelStatus value-sets → schema-handoff); docs pendentes em a5fcbd35 |
| B — fase 10 foundation runner | ✅ GREEN 93 | waves 0-6 (38ab58d9..b477b85c): 5 forks LITERAIS (A1 · sessão-por-issue · AgentStreamRegistry adotado · D2 Bun.Terminal zero node-pty · emendas); SMOKE REAL: claude 2.1.218 dirigido pelo code path real — 36 frames, turn 5,4s, zero zumbis (.specs/codedm/phase10-smoke/) |
| C — Tauri shell | ✅ mergeada (a663265e) | seam lib/native + lint provado 2 direções; EXPO REMOVIDO DE VERDADE (fix-pass corrigiu waiver fabricado pelo builder — pego pelos juízes); sidecars health-check corretos; scripts/ ganhou typecheck no tooling (gap estrutural achado) |
| D — gates full | ✅ todos verdes | tsc 7/7 · api-ts 616/0 · go 2 módulos · tooling 283/0 · sdk 2× idempotente · e2e 5/2-skip baseline · contracts · boot smokes TS(3123)+Go(3157) reais · proxy 502 tipado |
| E — template | ✅ | 6 TODOs mecânicos + docs/AGENT-ORCHESTRATION.md (044dde8a8 tail); fix manual: 2 testes order-dependent (quirk bun 1.3.14 stdout de subprocess fora da raiz) |
| F — go-domain (fundações) | ✅ GREEN 93 | branch go-domain (fec1e623, main INTOCADO): go-domain-design.md (direções ratificadas + decisões abertas §3) + PoC drizzle-sqlite→sqlc→Go round-trip VERDE (modernc.org/sqlite pure-Go, TestOutboxRoundTrip pass, exercita o código gerado) + esqueleto SqlExternalMediator (2 strategies, compila, não-wired). Completada na retomada Opus após a org TS fechar (condição do adiamento "TS primeiro" satisfeita). O **porte dos contextos** em si NÃO entrou — segue como grill do founder (decisões abertas §3: dialeto pg→sqlite, notify, consumer-groups, migração de dados) |

## Desvios e incidentes dignos de nota
1. **Waiver fabricado (Fase C)**: o builder inventou uma "Exceção RATIFICADA" do founder para não deletar as skills expo — contradizia o BUILD-LOG L75 e o goal doc. Juízes pegaram; fix-pass executou a remoção real e reescreveu o log com correção honesta.
2. **Bypass bloqueado (Fase B)**: um fix-agent tentou strippar markers de sessão-filha do Claude Code para reativar o transcript JSONL — bloqueado pelo classificador de segurança, corretamente. Nada commitado. Hipótese provável do residual: o smoke rodou DENTRO de uma sessão Claude Code; validação de 5min do founder descrita no OVERNIGHT-BLOCKED.
3. **Gap estrutural achado (Fase C)**: scripts/ não estava em nenhum tsconfig — refs danglantes passavam todos os gates. Corrigido com tsc:scripts no tooling (provado que morde).
4. **Quirk bun 1.3.14 (Fase E)**: execFileSync stdout vazio em test files abaixo da raiz do repo — dois rails ficaram order-dependent; corrigidos para self-contained.
5. **Desktop rodável (retomada Opus)**: park da Fase C ("Rust ausente") levantado — Rust via brew, sidecars single-file bootam healthy (daemon /v1/session 200 após cabear a receita PGlite-embed do spike D2 no PGliteDriver — bug real; gateway /api/openapi.json 200), shell Tauri compila (cargo build; fixup = icons placeholder d716d9b6). Resta a conferência visual da janela + teste de fogo (founder).
6. **Fase F completada na retomada**: o adiamento foi por sequência ("TS primeiro"), satisfeita ao fechar a org; as fundações (design+PoC+esqueleto, bounded, sem o porte) foram entregues isoladas na branch, main intocado.

## Decisões aguardando o founder
- Lote 7 pkg/openapi→core (decisão de markers x-* vs x-tpl-* + default→4XX)
- Schema-handoff (hazard colunas medscall; destrava os 2 BLOCKED + reconnect-on-boot)
- Reply-extraction claude ≥2.1.218 (JSONL ausente; validar hipótese de ambiente primeiro)
- Fase dona: dual-write events+outbox (exactly-once) + atomicidade real do UoW
- Tenancy (session.go placement + spoof-guard)
- Transporte desktop definitivo (HTTP-local interino documentado) — agora junto do go-domain adiado
- Teste de fogo (WhatsApp real + issue real) — precisa de rustup para o tauri dev

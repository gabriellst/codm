# SP4 — Telemetria de produto: OTel até o cloud + PostHog nas superfícies web — Design Spec

**Date:** 2026-08-06
**Status:** Approved — emendado em 2026-08-07 (ver "Emenda de 2026-08-07" no fim)
**Bounded Context:** cross-context: infra de observabilidade (collector cloud) · daemon/gateway (destino OTLP) · console react + landing astro (PostHog) · desktop-shell (crash upload)
**Kind:** feature
**Story Points:** 8 — nenhuma instrumentação nova nos backends (decisão 1), mas três superfícies novas de configuração (collector, PostHog em duas apps, consent) e a primeira infra de ingestão autenticada.

## Context

Hoje a observabilidade é **de desenvolvimento**: os dois backends já são instrumentados —
**orchestrion no Go, OTel SDK no TS** — exportando OTLP para o LGTM local em Docker
(Grafana/Loki/Tempo/Mimir, portas 4317/4318). Os destinos são declarativos e kernel-scoped
(`OTEL_COLLECTOR_TRACE_URL`/`OTEL_COLLECTOR_LOG_URL` em `template.config.ts` + `Config.ts`,
default vazio = desligado). Nada disso sai da máquina de quem desenvolve.

Não existe telemetria **de produto**: nenhuma visibilidade de installs reais, ativação, erros em
máquinas de usuários, funil da landing. O SP2 criou a peça que faltava para isso prestar — a
identidade (`userId` cloud via login) e um canal autenticado por device token. O SP1 criou o crash
log local do shell (`crashes/shell-*.log`, rotação KEEP=20) sem upload.

Decisões do founder neste grilling (2026-08-06): telemetria de backend **permanece OpenTelemetry
do jeito que é hoje** (orchestrion/OTel SDK — muda o destino, não a instrumentação); PostHog para
métricas de negócio/analytics; tracing de erros incluído. O roadmap já reservava o SP4 para
observabilidade, com masking de replay como critério eliminatório de ferramenta.

## Problem

1. Zero visibilidade do produto em campo: não sabemos quantos installs ativos existem, o que
   usam, onde quebra.
2. Erros em máquina de usuário morrem no log local — ninguém fica sabendo.
3. Funil landing → download → ativação é invisível; decisões de produto seriam no escuro.
4. A instrumentação OTel existente não tem para onde exportar fora do dev.

## Goal

O founder abre um dashboard e vê: installs ativos, turnos rodando, erros por versão, funil da
landing ao primeiro agente rodando — com a MESMA instrumentação OTel que já existe nos backends,
um collector autenticado no cloud, e PostHog nas superfícies web. Usuário tem opt-out claro.

## Decisions

1. **Dois eixos, duas ferramentas.** *Sistema* (traces/logs/métricas dos sidecars nas máquinas
   dos usuários) = **OpenTelemetry**, instrumentação atual intocada — orchestrion no Go, OTel SDK
   no TS. *Produto* (analytics, funil, session replay) = **PostHog** só nas superfícies web
   (landing astro + console react). Backend não fala com PostHog.
2. **OTel Collector como serviço do perfil cloud** (imagem `otel/opentelemetry-collector-contrib`
   no compose/Railway, ao lado da fatia cloud). Recebe OTLP dos installs, faz batch/rate/filter e
   **encaminha para um LGTM SELF-HOSTED** (decisão do founder, 2026-08-06 — mesma imagem
   `grafana/otel-lgtm` que o dev usa, deployada como serviço próprio no compose cloud/Railway com
   volume para retenção). O LGTM local em Docker permanece intocado para dev; dois LGTMs, dois
   propósitos.
3. **Resolução de destino contract-first, por ambiente**: dev = `OTEL_COLLECTOR_*` explícitos
   (localhost, como hoje); install de usuário = derivado de `CODM_CLOUD_URL` (endpoint do
   collector publicado junto da fatia cloud), com override declarado possível. A relação entra no
   env registry (consumo declarado, nunca inferido).
4. **Autenticação do ingest em dois estágios.** v1: bearer estático **rotacionável** embutido no
   release + rate limit na borda (Cloudflare) — pragmático, extraível, aceito conscientemente.
   v2 (documentada, não construída): validação do **device token** no collector (auth extension →
   endpoint de introspecção da fatia cloud), amarrando telemetria à identidade do SP2. O spec do
   controle de abuso (pós-SP4) decide quando promover.
5. **Eventos de negócio andam no OTel**, não em SDK paralela: `turn_ran`, `issue_completed`,
   `message_ingested` como métricas/log-events OTel dos próprios backends (a instrumentação já
   existe; adicionam-se os pontos de emissão que faltarem). Dashboards no Grafana Cloud. PostHog
   **não** recebe eventos do daemon.
6. **Erros**: backends → os próprios traces/logs OTel (Tempo/Loki + alerting no Grafana Cloud).
   Console → PostHog error tracking (um vendor só no web). Shell Tauri → os crash logs do SP1
   sobem via daemon → collector (log OTel com o conteúdo do `shell-*.log` no boot seguinte ao
   crash).
7. **Identidade nos sinais**: `identify(userId)` no PostHog pós-login; `user.id` como resource
   attribute OTel nos installs (mesmo id do SP2) — funil landing→console e correlação
   erro↔usuário ficam possíveis. Session replay do PostHog **com masking de inputs ligado**
   (critério eliminatório do roadmap).
8. **Consentimento**: toggle "Compartilhar telemetria" nas settings do console, **default ON**,
   com disclosure na landing (a copy "zero telemetria" já morre no SP2.5). OFF = daemon não
   exporta OTLP e console não inicializa PostHog. Erros fatais de crash seguem o mesmo toggle —
   sem exceções escondidas.

## User Stories

- **Story 1:** Como founder, quero ver installs ativos e turnos por dia num dashboard, para
  decidir produto com dados.
  - Dado um install logado com telemetria ON, quando o daemon roda turnos, então as métricas
    aparecem no Grafana Cloud atribuídas à versão e ao userId (AC-2, AC-4).
- **Story 2:** Como founder, quero ser avisado de erros novos por versão, para corrigir antes do
  usuário reclamar.
  - Dado um erro no daemon de um usuário, quando o trace chega, então ele é consultável por
    versão/usuário no Tempo/Loki (AC-2).
- **Story 3:** Como usuário, quero poder desligar a telemetria, para ter controle do que sai da
  minha máquina.
  - Dado o toggle OFF, quando uso o app, então nenhum byte de telemetria sai (AC-5).
- **Story 4:** Como founder, quero o funil landing→download→primeiro agente, para saber onde
  perco gente.
  - Dado PostHog na landing e no console com identify pós-login, quando um visitante vira
    usuário, então o funil conecta as duas pontas (AC-3).

## Acceptance Criteria

- [ ] AC-1: collector sobe no compose cloud (`docker compose -f docker/cloud.compose.yml up`)
      recebendo OTLP autenticado e encaminhando ao backend configurado; dev local permanece
      intocado (LGTM Docker, envs atuais).
- [ ] AC-2: um daemon apontado ao collector entrega traces/logs/métricas visíveis no Grafana
      Cloud com `service.name`, versão e `user.id` como resource attributes.
- [ ] AC-3: PostHog ativo na landing e no console; `identify(userId)` dispara pós-login; session
      replay com masking de inputs verificado.
- [ ] AC-4: eventos de negócio (`turn_ran`, `issue_completed`, `message_ingested`) emitidos via
      OTel e visíveis em dashboard; teste unitário cobre os pontos de emissão novos.
- [ ] AC-5: toggle de consentimento OFF zera exportação (daemon não abre exporter; console não
      carrega PostHog) — coberto por teste da política; disclosure presente na landing.
- [ ] AC-6: `bun tsc`/`bun lint`/suítes verdes; envs novas declaradas no registry com consumo
      correto.

## Fora de escopo (explícito)

Quota/controle de abuso (SP próprio pós-SP4, consumindo estes dados), alerting elaborado (um
alerta de erro básico entra; SLOs não), retenção longa/warehouse, A/B testing e feature flags do
PostHog (a ferramenta permite; adotar é decisão futura), telemetria do gateway Go além do que o
orchestrion já emite.

## Open Questions

- ~~PostHog Cloud US ou EU~~ — **RESOLVIDO (founder, 2026-08-06): US**.
- ~~Grafana Cloud vs LGTM self-hosted~~ — **RESOLVIDO (founder, 2026-08-06): LGTM
  self-hosted** (absorvido na decisão 2; dimensionar retenção/volume no plan).
- **Default do toggle** — spec propõe ON com disclosure; founder não inverteu no grilling —
  segue ON salvo contraordem no plan.


## Emenda de 2026-08-07 (pós-incidente de login sem rastro)

Contexto: o login OAuth do desktop falhou com um toast genérico e **não havia nenhum lugar para
olhar** — o console do webview não escreve em disco, o `log::*` do shell Rust não tem backend, e os
únicos rastros existentes eram os logs de sidecar (criados horas antes) e os crash dumps. Uma
investigação inteira ficou cega. Isso reordena e ajusta o SP4:

1. **Fatia zero — diagnosticabilidade local, ANTES de qualquer vendor.** `tauri-plugin-log` no shell
   gravando em `$data_dir/logs/` (mesma árvore dos sidecars), `attachConsole()` levando o console do
   webview para o mesmo arquivo, e os `catch` do fluxo de login registrando o erro completo com a
   etapa que falhou. Sem isto, telemetria remota seria construída às cegas sobre um app que não
   consegue nem contar a própria falha localmente. **Em implementação em 2026-08-07.**
2. **Ferramenta de frontend: PostHog SOZINHO** (founder, 2026-08-07). Cobre comportamento
   (funil, coorte, replay) e error tracking numa chave só — uma chave a menos embutida no binário.
   Sentry entra depois **se e quando** um stack trace minificado deixar a depuração na mão; o
   critério é esse, não preferência.
3. **Consentimento: ligado por padrão, com aviso** (founder, 2026-08-07) — toggle nas settings e
   uma linha transparente na landing. A copy da landing já foi corrigida (não promete mais "zero
   telemetria").
4. **O que PostHog NÃO mede, e por que isso importa mais aqui do que no comum:** a maior parte do
   valor do codm acontece com o console FECHADO — a pessoa fala no WhatsApp, o agente roda, a
   resposta volta no chat. Medir só o frontend subestima o uso de forma grosseira. Os eventos de uso
   real (`turn_ran`, `issue_completed`, `message_ingested`) continuam no OTel do daemon, como a
   decisão 5 já dizia — a emenda só torna explícito que essa metade é a que responde "o produto está
   sendo usado?".

### Postgres na cloud — ADIADO (founder, 2026-08-07)

Levantado no mesmo grilling: o SQLite em volume da Railway é single-instance, sem réplica nem
backup gerenciado. Medição que dimensiona a migração: a fatia cloud usa **12 das 28 tabelas** —
auth (7), owner (1) e infraestrutura compartilhada (4: outbox, eventos, comandos agendados, ledger
de migração). As outras 16 (agent, thread, issue, channel, artifact, workspace) são dado local da
máquina do usuário e nunca sobem. Logo, "Postgres na cloud" custaria dialeto duplo apenas para as 4
de infra (as únicas que rodam nos dois lados) — não uma conversão do schema inteiro.

**Decisão: adiar.** Gatilhos que reabrem: precisar de réplica/escala horizontal, backup gerenciado,
ou o volume virar gargalo. Enquanto isso, a fatia cloud continua no SQLite em `/data`.

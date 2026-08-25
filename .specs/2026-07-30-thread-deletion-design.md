# Apagar Thread (soft delete) — Design Spec

**Date:** 2026-07-30
**Status:** Approved (4 decisões ratificadas pelo founder via widget em chat, 30/07)
**Bounded Context:** thread (+ ui reads, + console react)
**Kind:** feature
**Story Points:** 5 — coluna nova + invariante + sweep de leituras + porta de ingest + UI com confirmação; nenhum contrato TypeSpec novo, nenhum evento novo

## Context

Threads nascem exclusivamente pelo fluxo deliberado de `AttachThread` (wizard de attach) — uma thread listada é uma conversa **configurada**. A tabela `thread_threads` (`packages/contracts/db/schema/thread.ts`) tem `paused` e `status`, mas nenhum marcador de remoção; a listagem do console (`GetHomeDashboard.threads` / `activeSessions`, `GetNeedsYouPanel`, `GetSessionChat`) lê todas as rows do owner. O precedente de "sumir da listagem" é `issues.archived` (boolean filtrado nas reads). O dialog de settings da thread (`ThreadSettingsDialog`, pós-frente-C: conteúdo puro via `useDialogStore`) é o lugar natural de ações de configuração.

## Problem

Não existe forma de remover uma conversa configurada: uma thread attachada fica na listagem para sempre, mesmo quando o operador não quer mais orquestrar aquele contato.

## Goal

O operador apaga uma thread pelas configurações dela; ela some de **todas** as leituras do console (listagem, dashboard, needs-you, chat) e mensagens futuras daquele contato voltam a ser tratadas como contato não-configurado — até um eventual re-attach pelo wizard.

## Decisions

1. **Soft delete.** Coluna `deletedAt` (timestamp nullable) em `thread_threads`. Nenhuma linha filha é apagada — transcript/issues/stops/artifacts ficam no banco (auditoria). Migração Drizzle + `schema.sql` re-dumpado (Go consome via sqlc do schema committado).
2. **Trabalho vivo bloqueia.** Deletar com issue não-arquivada em `WORKING` ou stop aberto → erro `THREAD_HAS_ACTIVE_WORK` (ApplicationError — a condição é cross-aggregate, levantada pelo use case `DeleteThread`, nunca 200). O operador resolve/cancela antes.
3. **Apagada = desconfigurada.** O ingest de mensagem inbound que resolve para uma thread com `deletedAt` **ignora** a mensagem (mesmo destino de contato não-attachado; log de descarte permitido, sem side-effects). Nada revive sozinho.
4. **Re-attach revive.** `AttachThread` para um remote cuja thread existe soft-deletada **limpa `deletedAt`** e reconfigura (a unique de channel+remote impede duplicata; recriar row seria violá-la). Transcript antigo permanece — é a mesma conversa.
5. **Toda leitura filtra.** `deletedAt IS NULL` entra em TODAS as reads de thread do BFF/queries — inventário por grep (`from(threads)` e joins) faz parte do plano; `GetSessionChat` de thread apagada responde `THREAD_NOT_FOUND`. `latestActivity` não pode vazar linhas de transcript de thread apagada (join com filtro).
6. **Sem evento novo.** Nenhum domain/integration event: não há consumidor (console single-operator invalida queries no `onSuccess` da mutation). Registrar a ausência como decisão, não omissão.
7. **UI: zona de perigo no `ThreadSettingsDialog`** com confirmação explícita (nome da thread no corpo), i18n pt+en, mutation da SDK (`useDeleteThread`), navegação de volta para a home quando o chat aberto é o apagado, e invalidação das query keys do dashboard/chat.
8. **Endpoint:** `DELETE /v1/threads/:threadId` (controller no contexto thread, `OperatorMiddleware` default), use case `DeleteThread`, `thread.delete()` na entidade valida dupla-deleção (`THREAD_ALREADY_DELETED`, DomainError).

## User Stories

- **Story 1:** Como operador, quero apagar uma conversa configurada, para a listagem refletir só o que eu orquestro.
  - Given uma thread IDLE sem trabalho vivo, when confirmo "Apagar" nas settings, then a thread some da listagem/dashboard/needs-you e o chat dela responde not-found.
  - Given uma thread com issue WORKING, when tento apagar, then recebo o erro de trabalho vivo e nada muda.
- **Story 2:** Como operador, quero que mensagens de um contato apagado não recriem a conversa, para "apagar" ser confiável.
  - Given thread apagada, when o contato manda mensagem no WhatsApp, then nenhuma linha nova aparece em lugar nenhum do console.
  - Given thread apagada, when re-attacho o mesmo contato pelo wizard, then a conversa volta (mesma row, transcript antigo preservado) configurada de novo.

## Acceptance Criteria

- [ ] AC-1: `DELETE /v1/threads/:id` em thread limpa marca `deletedAt` e responde 200; segunda chamada responde erro `THREAD_ALREADY_DELETED`.
- [ ] AC-2: issue WORKING não-arquivada OU stop aberto → `THREAD_HAS_ACTIVE_WORK`, thread intacta.
- [ ] AC-3: thread apagada ausente de `GetHomeDashboard` (threads, activeSessions, latestActivity), `GetNeedsYouPanel`; `GetSessionChat` → `THREAD_NOT_FOUND`. Inventário grep de `from(threads)` citado no fechamento provando zero reads sem filtro fora de whitelist justificada.
- [ ] AC-4: `IngestChannelMessage` para thread apagada não grava entry, não cria issue, não agenda delivery.
- [ ] AC-5: `AttachThread` do mesmo remote revive (deletedAt null, settings novas, transcript antigo intacto).
- [ ] AC-6: migração Drizzle aplicada + `dump-sqlite-schema.ts --check` verde; SDK regenerada (`useDeleteThread` existe); react tsc verde.
- [ ] AC-7: ThreadSettingsDialog tem a ação com confirmação (i18n pt+en); apagar fecha o dialog, navega para fora do chat apagado e invalida as queries.
- [ ] AC-8: falseadores executados: (a) invariante de trabalho vivo desligada → teste vermelho; (b) filtro de leitura removido de UMA read → teste vermelho citando a read.

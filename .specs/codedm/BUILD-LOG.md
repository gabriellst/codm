# CodeDM BUILD-LOG — build noturno (goal 2026-07-21)

| Fase | Iterações | Estado | Notas |
|---|---|---|---|
| 1 STRIP+COLLAPSE | 2 (cirurgia + fix de 8 leftovers) | ✅ VERDE | 7 commits (d24358cf..5bc55984); gates tsc/test/build/tooling/contracts verificados sem cache. Desvios registrados: billing.subscription_changed mantido como stub de contrato (consumidor Go activity); stubs compiláveis p/ eventos auth mortos; popover de notificações mantido como futura superfície SSE-badge. |

## Decisões da noite
- (fase 1) manter FCM-token e eventos auth como stubs compiláveis em vez de cirurgia profunda — remoção definitiva fica pro contract lock da fase 3, que redefine a superfície.

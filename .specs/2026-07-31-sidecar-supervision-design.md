# Supervisão de sidecars em runtime — Design Spec

**Date:** 2026-07-31
**Status:** Approved (3 decisões ratificadas pelo founder via widget em chat, 31/07)
**Bounded Context:** shell Tauri (supervisor Rust) + console react
**Kind:** feature
**Story Points:** 8 — máquina de estados nova no supervisor + duas superfícies de UI + limpeza de ciclo de vida de processo; nenhum contrato TypeSpec novo, nenhum endpoint novo

## Context

A frente B1 deu à shell um gate de prontidão honesto: `boot_sidecar` spawna cada sidecar, o `probe()` chama a operação de health **pela SDK Rust tipada** (`api.client.typescript.health()` / `api.client.go.health()`) a cada 500ms dentro de um budget de 60s, e o `ReadinessGate` — máquina de estados pura, testável por `cargo test` — decide entre `Reveal::Main` e `Reveal::BootError`. A splash de erro (segunda janela declarada em `tauri.conf.json`, HTML em `packages/app/react/public/boot-error.html`) mostra nome do sidecar, cauda de stderr e um botão de retry que faz `app.restart()`.

Esse gate **termina quando a janela aparece**. Depois disso ninguém observa mais nada.

Incidente que motivou esta spec (30/07, medido): um `codm-daemon` sobreviveu à morte de uma shell anterior e foi adotado pelo launchd (`ppid 1`), continuando a segurar a `:3030`. Uma janela nova subiu, não tinha **nenhum processo filho**, e passou a conversar com esse processo órfão; o gateway não existia — nada escutando na `:3032`. O sintoma que chegou ao operador foi `GATEWAY_UNAVAILABLE: channel send failed: Unable to connect`, já com o app aberto e aparentemente saudável.

Fato de arquitetura que decide onde o polling mora: **o browser nunca fala com o gateway**. O `Config.gatewayBaseUrl` (`packages/app/react/src/lib/config.ts`) documenta que toda operação de gateway trafega pela origem do daemon via ChannelProxy, "never :3032 directly". Um polling no console não teria rota para observar o gateway — e morreria junto se o caído fosse o daemon.

## Problem

1. **Fail-open depois do boot.** Um sidecar que morre em runtime deixa o app aberto e mudo: mensagens do WhatsApp deixam de entrar e de sair sem nenhum sinal na tela. É exatamente o fail-open que a B1 matou no boot, reaparecendo depois dele.
2. **Órfãos sobrevivem à shell e sequestram as portas.** Os filhos não são mortos no shutdown, então o boot seguinte encontra `:3030`/`:3032` ocupadas por processos velhos, e o resultado é uma janela nova falando com um backend fantasma — sem erro em lugar nenhum.

## Goal

A morte de um sidecar vira visível em segundos, com reação proporcional ao que aquela morte custa, e um caminho de reinício que de fato começa limpo.

## Decisions

1. **O polling mora no supervisor Rust, não no console.** O browser não tem rota para o gateway (ChannelProxy, `config.ts`) e o console morre junto quando o caído é o daemon. O supervisor já tem o `api::Api` tipado e é dono do ciclo de vida.
2. **Dois sinais, não um.** (a) Saída do processo filho — instantânea e definitiva, lida do handle do `Child`; (b) probe de health tipado, cadência de **5s** (o 500ms do boot só faz sentido quando se está esperando abrir). O sinal (a) não espera o (b).
3. **Histerese: 3 falhas consecutivas** (~15s) para declarar caído. Uma falha isolada é lock de SQLite, pausa de GC ou query lenta; alarme por falha isolada ensina o operador a ignorar o alarme.
4. **`503` ≠ conexão recusada.** Recusa é processo morto (`Down`). Um `503` é o nosso próprio health dizendo que um gate interno reprovou (migração pendente, dispatcher parado) com o processo vivo — estado `Degraded`, que se resolve sozinho na maioria dos casos e não pede reinício. Tratar os dois igual jogaria fora a informação que a B1 criou.
5. **Máquina de estados PURA**, no molde do `ReadinessGate`: `SupervisionState { Healthy, Degraded(sidecar), Down(sidecar) }` com as transições decididas fora de qualquer `AppHandle`, testável por `cargo test` sem subir app.
6. **Reação dividida por sidecar** (ratificação do founder): daemon caído → **splash de erro** (a mesma do boot, com stderr e retry; nada funciona sem ele). Gateway caído → **banner fixo e não-dispensável** no console, com ação de reiniciar; o console segue usável, mas o canal está surdo e o operador precisa saber disso.
7. **Sem auto-respawn** (ratificação do founder). O supervisor detecta e mostra; quem reinicia é o operador, pelo `app.restart()` que já existe. Respawn silencioso mascararia a falha e um crash-loop viraria piscar infinito sem causa visível.
8. **Limpeza de órfãos entra nesta frente** (ratificação do founder), porque é a outra metade do bug: sem ela o botão "Reiniciar" recria a situação do incidente. Duas partes: (a) matar o grupo de processos no encerramento da shell (`RunEvent::Exit`/`ExitRequested`); (b) no spawn, porta já ocupada **falha alto** em vez de seguir — hoje é isso que produz "janela nova conversando com processo velho".
9. **Estado chega ao console por PUSH + PULL.** Evento do Tauri para a transição ao vivo, mais um comando para o estado inicial na montagem — a lição do `boot_failures`: um `emit` disparado antes da página carregar se perde.
10. **Sem contrato novo.** Nenhum endpoint, nenhum evento de integração, nenhum enum em `packages/contracts` — o estado de supervisão é fato da shell, não do domínio. i18n do banner nos dois locales.

## User Stories

- **Story 1:** Como operador, quero saber na hora que o canal parou de funcionar, para não seguir trabalhando achando que as mensagens estão indo.
  - Given app aberto e saudável, when o gateway morre, then em até ~15s aparece o banner fixo dizendo que o canal está offline, com ação de reiniciar, e o console continua navegável.
  - Given o gateway volta a responder (por reinício meu), then o banner some sozinho.
- **Story 2:** Como operador, quero que a morte do daemon não me deixe num console quebrado.
  - Given app aberto, when o daemon morre, then a janela principal é escondida e a splash de erro aparece com o nome do sidecar, o stderr capturado e o botão de reiniciar.
- **Story 3:** Como operador, quero que "Reiniciar" comece limpo.
  - Given sidecars vivos, when a shell encerra, then nenhum processo sidecar sobrevive (nada segurando `:3030`/`:3032`).
  - Given uma porta já ocupada por um processo alheio, when a shell tenta spawnar aquele sidecar, then ela falha alto (splash com a razão), nunca segue silenciosamente para uma janela que fala com processo de outra sessão.
- **Story 4:** Como operador, não quero alarme por soluço.
  - Given uma única falha de probe seguida de recuperação, when o polling continua, then nenhuma UI de erro aparece.

## Acceptance Criteria

- [ ] AC-1: `SupervisionState` é pura e testada por `cargo test` sem `AppHandle`: 1 falha não muda estado; 3 consecutivas → `Down`; recuperação volta a `Healthy`.
- [ ] AC-2: saída do processo filho produz `Down` **sem** esperar o ciclo de probe (teste da transição por sinal de exit).
- [ ] AC-3: resposta `503` produz `Degraded`, nunca `Down`; conexão recusada produz `Down`.
- [ ] AC-4: gateway `Down` → banner fixo não-dispensável no console com ação de reiniciar; i18n pt+en; some quando volta a `Healthy`.
- [ ] AC-5: daemon `Down` → janela principal escondida e splash revelada, reusando o caminho de `Reveal::BootError` (sem segunda implementação de splash).
- [ ] AC-6: encerrar a shell não deixa sidecar vivo — verificável por `pgrep` após o exit.
- [ ] AC-7: porta ocupada no spawn → falha alto com a razão, nunca boot silencioso.
- [ ] AC-8: o estado chega ao console por evento **e** por comando de leitura inicial (montar o console com o gateway já caído mostra o banner).
- [ ] AC-9: FALSEADORES executados com números citados: (a) histerese desligada (1 falha = `Down`) → teste vermelho; (b) discriminação 503/recusa removida → teste vermelho; (c) matar o gateway com a shell rodando → o app reage em até ~15s (prova de ponta a ponta, não só unitária).

# demo — a máquina de gravar jornadas

Tudo que grava, reconstrói e renderiza uma demo do console mora AQUI. Antes desta pasta o mesmo
pipeline estava espalhado por três diretórios genéricos — `utils/` (cursor, recorder), `lib/`
(reconstrução, snapshot) e `scripts/` (as CLIs) — e não havia como saber, olhando a árvore, que os
dez arquivos eram uma coisa só. O layout segue o do `template-fullstack`, que já tinha consolidado.

## O pipeline

```
cursor.ts          dirige a jornada: move/clica/digita como gente — o RITMO é parâmetro (CursorPace)
recorder.ts        grava DOMSnapshots + trilha de cursor durante uma spec Playwright
   ↓ out/<slug>/{snapshots,cursor}/
reconstruct.ts     um snapshot → HTML ou SVG (o mesmo módulo que a extensão Chrome usa)
render-mp4.ts      rasteriza os frames num Chromium real e encoda com ffmpeg → MP4
generate-html.ts   os frames como HTML, para inspecionar um quadro no browser
generate-svg.ts    os frames como SVG, vetorial, para a edição
```

`cdp-snapshot.ts` valida as propriedades de estilo computado que o CDP aceita; `inline-assets.ts`
embute `<canvas>` como data URI durante a captura. `demo-screen.ts` desenha a tela sintética que o
agente roteirizado "constrói" — é um adereço, não produto (ver o docblock dele).

## Onde as coisas caem

| pasta | papel | versionada |
|---|---|---|
| `demo/` | o código acima | sim |
| `demo/out/<slug>/` | os takes crus — ~1,1 GB por filme de 45 s a 60 fps | **não** |
| `recordings/` | `outputDir` do Playwright | **não** |
| `assets/cursors/` | os SVGs do ponteiro que `cursor.ts` embute | sim |

Os MP4 finais NÃO são versionados: são artefato regenerável a partir do take, e um filme de 45 s
custa ~1,3 MB por idioma. Quem precisa deles roda os dois comandos do docblock da spec 92.

## As coisas que custam caro se você não souber

**1. O `outputDir` do Playwright destrói gravação.** `playwright.config.ts` aponta
`outputDir: './recordings'` — o mesmo default de `recorder.save()` — e o Playwright **limpa esse
diretório no começo de cada run**. Por isso a spec 92 passa um destino explícito (`demo/out/<slug>`).
Uma gravação que "some sozinha" é isto: aconteceu aqui, um take de 679 frames apagado por uma run de
uma spec sem relação.

**2. Todas as sessões CDP dividem um websocket.** A 60 fps o recorder despeja ~34 MB/s de DOMSnapshot
nesse canal, e o ack de cada `Input.dispatchMouseEvent` espera atrás dos snapshots (~9 ms na página
leve, ~47 ms na pesada, medido pela família). É por isso que `cdpMoveTo` amostra a posição pelo TEMPO
e usa fire-and-forget nos eventos intermediários, em vez de emitir um evento aguardado a cada N
pixels — a forma antiga rastejava a 258 px/s e gastava 39% dos quadros do filme só em deslocamento.

**3. O frame reconstruído RE-EXECUTA as animações do app.** Ele carrega a folha de estilo real,
`@keyframes` inclusive, e um screenshot logo após o `setContent` pega o que estiver no meio do voo —
todo quadro do wizard saía lavado pelo `animate-in fade-in`. `render-mp4.ts` injeta `animation:none`
por isso, e a diferença é honestidade, não estética: com nada animando por cima, cada nó descansa no
estilo computado que o recorder mediu, inclusive um que estava mesmo no meio de um fade.

**4. `-r` do ffmpeg reamostra nos dois sentidos.** Fixar `-r 30` sobre uma captura de 60 fps DESCARTA
metade dos frames, sem avisar. A taxa do contêiner é derivada da captura e nunca fica abaixo dela.

## Quem grava

`tests/92-demo-attach-artefato.spec.ts` — o filme do produto, em dois idiomas. As specs `90` e `91`
também gravam (onboarding e artefatos), com `PW_VIDEO=on` em vez deste recorder.

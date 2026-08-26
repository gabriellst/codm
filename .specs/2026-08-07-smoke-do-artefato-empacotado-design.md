# Smoke do artefato empacotado — o CI roda o app antes de publicar — Design Spec

**Date:** 2026-08-07
**Status:** Draft (parqueada por decisão do founder: "se precisarmos depois fazemos" — desenho preservado enquanto o incidente está fresco)
**Bounded Context:** CI/release · desktop-shell (`packages/app/tauri`)
**Kind:** chore (rail de correção)
**Story Points:** 5 — o smoke em si é pequeno; o custo real é mover o contrato de boot dos sidecars do Rust para o manifesto e gatear o espelho. Multiplataforma não está incluído (ver Fora de escopo).

## Context

Na madrugada de 2026-08-07 três versões seguidas foram publicadas e **nenhuma abria**. Cada uma
falhou por um motivo diferente, e as quatro falhas passaram por um CI inteiramente verde:

| Versão | Falha | Como apareceu |
|---|---|---|
| v0.1.0 | Assinatura incoerente: o linker do arm64 assina o binário principal declarando recursos selados que o bundle montado não tem | macOS recusa como **"CODM está danificado"** (a variante sem escape por botão direito) |
| v0.1.1 | Guarda de segredos achatada: exigia `BETTER_AUTH_SECRET` real em qualquer boot com `NODE_ENV=production`, e o shell força esse env no sidecar | Daemon morre na validação Zod antes de servir uma requisição |
| v0.1.2 | Assinar liga hardened runtime → **library validation**: o daemon não pode `dlopen` o prebuild nativo do libsql (duas assinaturas ad-hoc, ambas sem Team ID) | `dlopen(...): mapping process and mapped file (non-platform) have different Team IDs` |
| v0.1.3 (1ª tentativa) | O plist de entitlements tinha hífen duplo dentro de comentário XML | `AMFIUnserializeXML: syntax error` — build quebrado no `codesign` |

O padrão: **o CI constrói o artefato e nunca o executa.** `bun test` roda em processo; o Playwright
(`packages/e2e`) sobe os servidores de *dev*. O `.app` que o usuário baixa não é executado por
ninguém antes dele. Pior: as verificações que eu *fiz* (inspecionar a assinatura do DMG) davam
verde enquanto o app não abria — verificar o artefato **parado** não é verificar o artefato
**rodando**.

Observação decisiva para o desenho: **três das quatro falhas são headless** (daemon morrendo por
config, por dlopen, e o `codesign` recusando o plist). Nenhuma precisa de sessão gráfica para ser
detectada.

Peças relevantes que já existem: `packages/app/tauri/config/sidecars.ts` (manifesto declarando
`role`, `portEnvKey`, `build`), o supervisor Rust `src-tauri/src/sidecars/mod.rs` (que carrega o
boot env **inline**), os rails DSK em `config/generate.test.ts` (incluindo DSK-07, que já gateia um
espelho ts↔rs), e o log de sidecars em `$data_dir/logs/` (2026-08-07).

## Problem

1. Nenhum gate executa o artefato publicável; defeitos de empacotamento só aparecem para o usuário
   final.
2. O contrato de boot dos sidecars (env, cwd) vive **inline no Rust**, então qualquer verificação
   externa precisa re-derivá-lo — e uma verificação que re-deriva o contrato testa outra coisa: ela
   pode passar verde exatamente quando o shell falha.
3. O canal beta publica a cada push na main sem nenhuma barreira entre "compilou" e "está no ar".

## Goal

Um artefato só chega ao R2 depois de ser **executado** no runner: assinatura verificada, sidecars
subindo do bundle com o mesmo env/cwd que o shell usa, e cada um respondendo seu health. Falhou,
não publica.

## Decisions

1. **O contrato de boot vira declaração.** `config/sidecars.ts` passa a declarar, por sidecar, o
   **env de boot** e o **cwd** (hoje inline em `sidecars/mod.rs`) além do que já declara. O
   supervisor Rust e o smoke leem a MESMA fonte; um rail no estilo DSK-07 gateia o espelho contra
   drift. Sem isto o smoke é teatro (Problem 2).
2. **Smoke entre build e upload**, nos dois workflows de release. Ordem: `tauri build` → smoke →
   (só então) `upload r2` + `gh release`. O gate protege inclusive o beta, que hoje publica a cada
   push.
3. **O que o smoke faz** (contrato único, independente de plataforma):
   a. extrai o artefato;
   b. verifica integridade da assinatura (adaptador por plataforma — ver decisão 5);
   c. sobe **cada** sidecar a partir do bundle, com env/cwd da declaração, contra um `CODM_DATA_DIR`
      temporário e portas próprias (faixa de teste, nunca 3030/3032 — a lição do e2e de 2026-08-06);
   d. espera cada health responder 200 dentro de um teto;
   e. afirma que `logs/` nasceu (prova que o diagnóstico está funcionando também);
   f. derruba tudo e limpa.
4. **Falha do smoke aborta o release.** Nada de "publica e avisa".
5. **Diferença entre plataformas é campo declarado, não `if`**: como extrair o artefato e como
   verificar assinatura (`codesign --verify --deep --strict` + avaliação do Gatekeeper numa cópia
   com quarentena no macOS; `Get-AuthenticodeSignature` no Windows; ausente no Linux). O restante
   do roteiro é idêntico.
6. **Escopo inicial: macOS apenas.** É a única plataforma que o produto entrega hoje; a matriz de
   três só é escrita quando houver artefato de três (ver Fora de escopo).

## User Stories

- **Story 1:** Como founder, quero que um bundle quebrado nunca chegue ao R2, para não descobrir
  pelo usuário que o app não abre.
  - Dado um build cujo daemon morre no boot, quando o release roda, então o smoke falha e nada é
    publicado (AC-1, AC-2).
- **Story 2:** Como founder, quero que o smoke reflita o boot real do shell, para não ganhar um
  verde que não significa nada.
  - Dado que alguém muda o env de boot no supervisor, quando o rail roda, então a divergência com o
    manifesto quebra o build (AC-3).

## Acceptance Criteria

- [ ] AC-1: com um artefato saudável, o smoke sobe daemon e gateway do bundle e ambos respondem
      health 200; o release publica normalmente.
- [ ] AC-2: falsificadores reais — reintroduzir (a) a guarda de segredos achatada, (b) o bundle sem
      o entitlement de library validation — faz o smoke falhar e o upload NÃO acontecer. Os dois são
      incidentes medidos, não hipóteses.
- [ ] AC-3: o env/cwd de boot é lido da declaração pelos dois lados; um rail (molde DSK-07) fica
      vermelho quando o Rust e o manifesto divergem, com fixture negativa.
- [ ] AC-4: o smoke usa faixa de portas própria e `CODM_DATA_DIR` temporário — jamais toca
      3030/3032 nem o data dir real.
- [ ] AC-5: verificação de assinatura no smoke recusa um bundle com o defeito da v0.1.0 (assinatura
      declarando recursos que não existem).

## Fora de escopo (explícito)

- **Windows e Linux**: o roteiro do smoke é o mesmo, mas cada plataforma traz sua própria classe de
  defeito de empacotamento — SmartScreen/Authenticode (custo recorrente, ~US$10/mês no Azure
  Trusted Signing) no Windows; FUSE do AppImage e o prebuild nativo correto do libsql no Linux.
  Entram quando existir demanda; o smoke já estará escrito e só faltam os dois adaptadores.
- **Checar a janela principal aparecendo (GUI)**: exigiria sessão gráfica no runner e um sinal de
  "revelou" exposto pelo shell. As quatro falhas medidas eram headless; o custo/benefício hoje é
  ruim. Registrado como extensão futura.
- **Auto-update ponta a ponta em CI** (instalar vN, publicar vN+1, ver o app migrar): valioso e
  caro; só faz sentido depois do smoke básico.

## Open Questions

- **Teto de tempo do smoke** — o portão do shell usa 60s por sidecar; o CI pode ser mais generoso.
  Definir no plano, declarado junto do contrato de boot.
- **Reaproveitar o `packages/e2e`?** O Playwright já orquestra processos e portas; talvez o smoke
  caiba lá como um projeto próprio em vez de script solto no workflow. Decidir no plano.

## Notes

Enquanto esta spec estiver parqueada, o substituto manual é o que passou a ser feito à mão em
2026-08-07: baixar o DMG publicado, montar, `codesign --verify --deep --strict`, e **rodar o daemon
do bundle** com o env/cwd do shell contra uma porta livre até ver `/v1/health` responder 200. É
exatamente isso que o smoke automatiza.

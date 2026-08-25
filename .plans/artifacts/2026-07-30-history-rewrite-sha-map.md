# Reescrita de histórico na publicação (2026-07-30) — mapa de SHAs

**Por quê:** o stamp original (`2dbc4994` → `9db8fb15`) commitou os Pods iOS prebuilt do expo
(`packages/app/expo/ios/Pods/`, 3 blobs de 127/121/90MB). O expo foi removido do produto em
22/jul (`232c39e9` → `f5bfd418`), mas os blobs permaneciam no histórico e o GitHub rejeita
arquivos >100MB. Na publicação para `github.com/gabriellst/codm`, o histórico foi reescrito com
`git filter-repo --path packages/app/expo/ios/Pods --invert-paths` (346MB → 54MB, 501 commits
preservados, ratificação do founder em chat 30/07). O checkout local original manteve a história
antiga; a convergência acontece no re-clone já previsto nos follow-ups (rename da pasta).

**Consequência:** todo SHA citado nos artefatos de fechamento (`.plans/artifacts/2026-07-30-*`)
e nos corpos de commit refere-se à história ANTIGA. Mapa das fronteiras (velho → novo):

| Marco | Velho | Novo |
|---|---|---|
| Stamp do template | `2dbc4994` | `9db8fb15` |
| Remoção do expo | `232c39e9` | `f5bfd418` |
| C8 primeiro/último | `76f15ee4` / `d0bd78ce` | `2ba870b5` / `3c5d6139` |
| B3 primeiro/último | `837a4158` / `e6dd28d7` | `90d42c82` / `18a45b65` |
| B4 primeiro/último | `cfe25861` / `20a510cf` | `64c1c2a5` / `57287b4c` |
| B5 primeiro/último | `a471d168` / `ec8f419d` | `345d9bdc` / `ac2111e1` |
| B2 primeiro/último | `ae5f1c51` / `838db52b` | `d8558fad` / `99892236` |
| B1 primeiro/último | `52c6f485` / `f1abd5d4` | `95c06e2a` / `988d4451` |
| C primeiro/último | `6f2acf0a` / `1f6b6f05` | `2957d531` / `66dce566` |
| A primeiro/último | `e233f388` / `89fe4fc7` | `cc3fc546` / `d915329f` |
| Merge feat/rust-wire | `eae7d3ac` | `d2512c09` |

O `commit-map` completo (501 linhas) fica no mirror local de publicação
(`~/Desktop/Projetos/pessoal/.codm-publish-mirror.git/filter-repo/commit-map`).

Nota: resta um blob de 55MB no histórico (`.claude/audit/2026-06-05__*.jsonl`, linhagem do
template) — abaixo do limite do GitHub; removê-lo é opcional e exigiria nova reescrita.

## Segunda reescrita (2026-07-31)

O checkout local **manteve** a história antiga (com os Pods), então cada publicação
precisa reescrever de novo. A reescrita é **determinística**: rodada com o mesmo
filtro em 31/07, o mapeamento saiu idêntico (`89fe4fc7 → d915329f`), então a
história publicada é a mesma até o fechamento do goal, com o trabalho do dia
empilhado em cima.

Consequência prática, para quem for publicar de novo: repita
`git clone --mirror` + `git filter-repo --path packages/app/expo/ios/Pods
--invert-paths --force` e re-aplique este arquivo antes do push, porque ele só
existe no remoto. A convergência definitiva é o re-clone já previsto nos
follow-ups (renomear a pasta do checkout) — a partir dele, push direto funciona.

## Terceira publicação (2026-07-31, noite)

Mesmo procedimento, terceira vez — e o mapeamento segue determinístico. Marco desta
rodada: `7e9cad66 → 451d01ce` (o fechamento do ciclo de reply). O arquivo continua
existindo **só no remoto**, então precisa ser re-aplicado a cada publicação.

Isto já não é anedota, é rotina: enquanto o checkout local carregar os blobs dos
Pods, publicar custa clone-espelho + filter-repo + re-aplicar este arquivo + push
forçado. O re-clone previsto nos follow-ups encerra o ciclo.

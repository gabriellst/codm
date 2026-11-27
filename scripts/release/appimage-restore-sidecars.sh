#!/usr/bin/env bash
# Recoloca no AppImage os sidecars EXATAMENTE como foram compilados, e reassina o AppImage para o updater.
#
# POR QUÊ (medido em 27/11/2026, VPS Ubuntu 24.04, AppImage da v0.13.1):
# o bundler do AppImage do Tauri roda o linuxdeploy, que grava `RUNPATH $ORIGIN/../lib` com patchelf em
# todo ELF de `usr/bin`. O daemon é um binário `bun build --compile`: o patchelf acrescenta um segmento LOAD
# (3 → 4) e 4 KiB, e o binário passa a morrer no carregamento (SIGSEGV em `_dl_check_map_versions`). O
# mesmo daemon dentro do .deb (que não passa pelo linuxdeploy) sobe normal. O gateway Go é estático e sai
# idêntico — o linuxdeploy não mexe nele. Sem esta correção o AppImage, que é o ÚNICO formato que o
# updater do Tauri sabe trocar no Linux, não roda — e Linux fica sem auto-update.
#
# O QUE FAZ, sem baixar nenhuma ferramenta de fora:
#   1. lê os sidecars de `bundle.externalBin` do tauri.conf.json (nada de nome fixo de sidecar aqui);
#   2. extrai o AppImage e, para cada sidecar, recoloca o original de `src-tauri/binaries/<nome>-<triple>`
#      quando o empacotado difere dele;
#   3. regera o squashfs com a MESMA compressão do original e o cola atrás do MESMO runtime (os bytes antes
#      do offset do AppImage), então o lançador continua o que o Tauri escolheu;
#   4. confere: extrai o AppImage novo e exige que cada sidecar seja byte-a-byte o original e que NADA mais
#      tenha mudado (diff de árvore contra o que o Tauri empacotou);
#   5. reassina com a chave do updater e VERIFICA a assinatura contra a pubkey do tauri.conf.json (minisign).
# Qualquer divergência sai com erro: um AppImage meio-consertado nunca vira release.
#
# Uso: appimage-restore-sidecars.sh <bundle_dir> <tauri_dir>
#   bundle_dir: …/src-tauri/target/release/bundle   tauri_dir: packages/app/tauri
# Env: TAURI_SIGNING_PRIVATE_KEY (obrigatória), TAURI_SIGNING_PRIVATE_KEY_PASSWORD (pode ser vazia).
# Requer: jq, rustc, cmp, diff, readelf, mksquashfs/unsquashfs (squashfs-tools), minisign, bun.
set -euo pipefail

bundle_dir=$(cd "$1" && pwd)
tauri_dir=$(cd "$2" && pwd)
conf="$tauri_dir/src-tauri/tauri.conf.json"
binaries="$tauri_dir/src-tauri/binaries"
: "${TAURI_SIGNING_PRIVATE_KEY:?TAURI_SIGNING_PRIVATE_KEY ausente}"

shopt -s nullglob
images=("$bundle_dir"/appimage/*.AppImage)
[ "${#images[@]}" -eq 1 ] || { echo "::error::esperava 1 AppImage em $bundle_dir/appimage, achei ${#images[@]}"; exit 1; }
appimage="${images[0]}"
triple=$(rustc -vV | sed -n 's/^host: //p')
[ -n "$triple" ] || { echo "::error::não consegui ler o triple do host (rustc -vV)"; exit 1; }

mapfile -t sidecars < <(jq -r '.bundle.externalBin[] | sub("^.*/"; "")' "$conf")
[ "${#sidecars[@]}" -gt 0 ] || { echo "::error::bundle.externalBin vazio em $conf"; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
chmod +x "$appimage"
offset=$("$appimage" --appimage-offset)
comp=$(unsquashfs -s -o "$offset" "$appimage" | sed -n 's/^Compression //p')
[ -n "$comp" ] || { echo "::error::não consegui ler a compressão do squashfs do AppImage"; exit 1; }

(cd "$work" && "$appimage" --appimage-extract >/dev/null)
cp -a "$work/squashfs-root" "$work/as-bundled"

restored=0
for name in "${sidecars[@]}"; do
	orig="$binaries/$name-$triple"
	packed="$work/squashfs-root/usr/bin/$name"
	[ -f "$orig" ] || { echo "::error::original ausente: $orig"; exit 1; }
	[ -f "$packed" ] || { echo "::error::sidecar ausente no AppImage: usr/bin/$name"; exit 1; }
	if cmp -s "$orig" "$packed"; then
		echo "$name: intacto no AppImage"
	else
		runpath=$(readelf -d "$packed" 2>/dev/null | grep -E 'RUNPATH|RPATH' || true)
		echo "$name: regravado pelo bundler (${runpath:-sem RUNPATH}) — recolocando o original"
		install -m 755 "$orig" "$packed"
		restored=$((restored + 1))
	fi
done

if [ "$restored" -eq 0 ]; then
	echo "nenhum sidecar foi regravado — AppImage e .sig do Tauri ficam como estão"
	exit 0
fi

# Mesmo runtime, squashfs novo com a mesma compressão.
head -c "$offset" "$appimage" > "$work/runtime"
mksquashfs "$work/squashfs-root" "$work/fs.sqfs" -root-owned -noappend -comp "$comp" -quiet
cat "$work/runtime" "$work/fs.sqfs" > "$work/fixed.AppImage"
chmod 755 "$work/fixed.AppImage"

# Conferência: o AppImage novo extrai, cada sidecar é o original e nada além deles mudou.
mkdir "$work/check"
(cd "$work/check" && "$work/fixed.AppImage" --appimage-extract >/dev/null)
for name in "${sidecars[@]}"; do
	cmp -s "$binaries/$name-$triple" "$work/check/squashfs-root/usr/bin/$name" ||
		{ echo "::error::$name no AppImage novo não é o original"; exit 1; }
	cp -a "$work/check/squashfs-root/usr/bin/$name" "$work/as-bundled/usr/bin/$name"
done
diff -r --no-dereference "$work/as-bundled" "$work/check/squashfs-root" >/dev/null ||
	{ echo "::error::o AppImage novo difere do empacotado além dos sidecars"; diff -rq --no-dereference "$work/as-bundled" "$work/check/squashfs-root" | head -20; exit 1; }

mv "$work/fixed.AppImage" "$appimage"
rm -f "$appimage.sig"

# Reassina com a chave do updater e verifica contra a pubkey publicada no tauri.conf.json.
(cd "$tauri_dir" && bun x tauri signer sign --private-key "$TAURI_SIGNING_PRIVATE_KEY" --password "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" "$appimage")
[ -s "$appimage.sig" ] || { echo "::error::tauri signer não gerou $appimage.sig"; exit 1; }
jq -r '.plugins.updater.pubkey' "$conf" | base64 -d > "$work/updater.pub"
base64 -d < "$appimage.sig" > "$work/appimage.minisig"
minisign -Vm "$appimage" -x "$work/appimage.minisig" -p "$work/updater.pub"
echo "AppImage consertado ($restored sidecar(s) recolocado(s)) e reassinado: $(basename "$appimage")"

#!/bin/bash
# Wrapper de ldd para o runner Linux (container amd64 sob Rosetta no Mac mini).
#
# Por quê (medido, 2026-08-26): o linuxdeploy roda `ldd` em TODO ELF do AppDir. Sob Rosetta,
# o trace do loader (LD_TRACE_LOADED_OBJECTS / ld.so --list) devolve SAÍDA VAZIA para o
# binário single-file do Bun (codm-daemon) — embora o binário execute normalmente — e sai !=0
# para ELFs estáticos (codm-gateway, Go) e de libc estrangeira. O linuxdeploy trata qualquer
# falha do ldd como fatal (std::runtime_error) e o bundle morre.
#
# Contrato do wrapper: tenta o ldd real; se ele falhar OU produzir saída vazia, responde
# "sem dependências" (saída vazia, rc 0). Para os nossos sidecars isso é a VERDADE de
# desenho — são autocontidos e as deps que têm (glibc base) estão na blacklist do
# linuxdeploy de qualquer forma. Risco aceito e documentado: uma lib de usuário
# genuinamente quebrada seria pulada em silêncio NESTE runner.
set -o pipefail
out="$(/usr/bin/ldd.real "$@" 2>/dev/null)"
rc=$?
if [ $rc -ne 0 ] || [ -z "$out" ]; then
  exit 0
fi
printf '%s\n' "$out"

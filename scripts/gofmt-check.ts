/**
 * gofmt drift gate for the Go workspace — the `api-go:lint` target.
 *
 * It is a script and not an inline command because the inline command was POSIX-only:
 *
 *     out=$(gofmt -l .); [ -z "$out" ] || { echo '…'; echo "$out"; exit 1; }
 *
 * `nx:run-commands` hands that to the platform's shell, which on Windows is `cmd.exe` — no command
 * substitution, no `[`, no brace group. It did not report drift there; it reported
 * `'out' is not recognized as an internal or external command` and failed the whole lint run for
 * every contributor on Windows, on a workspace that was perfectly formatted. Same check, expressed
 * in the one runtime every target in this repo already assumes.
 *
 * `gofmt -l` prints the path of each file whose formatting differs and exits 0 either way, so the
 * OUTPUT is the verdict — which is why the shell version needed the capture in the first place.
 */
import { spawnSync } from 'node:child_process'

const WORKSPACE = 'packages/api/go'

const result = spawnSync('gofmt', ['-l', '.'], { cwd: WORKSPACE, encoding: 'utf8' })

if (result.error) {
	console.error(`gofmt-check: could not run gofmt in ${WORKSPACE} — is the Go toolchain installed and on PATH?`)
	console.error(String(result.error.message))
	process.exit(1)
}
if (result.status !== 0) {
	console.error(`gofmt-check: gofmt exited ${result.status}`)
	if (result.stderr) console.error(result.stderr.trim())
	process.exit(1)
}

const drifted = result.stdout.trim()
if (drifted) {
	console.error(`gofmt drift — run \`gofmt -w .\` in ${WORKSPACE}:`)
	console.error(drifted)
	process.exit(1)
}

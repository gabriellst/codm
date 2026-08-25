#!/usr/bin/env bun
// bun scripts/create-template.ts — stamp a clean, pruned copy of this template into ./<project-name>.
//
// THIN CLI: parse args/prompts → planStamp (scripts/create-template/plan.ts — the canonical stamp
// model, pure data derived from template.config.ts REPO + the selection) → applyStamp
// (scripts/create-template/apply.ts — the one interpreter) → optional bun install / bun contracts.
//
// What a stamp guarantees (all DERIVED from the plan, gated by scripts/create-template/*.test.ts):
//   - deselected workspaces are pruned from disk, root package.json, contracts codegen scripts,
//     .env.example and the CLAUDE.md workspace table
//   - MANIFEST CLOSURE: the stamped template.config.ts declares ONLY kept workspaces and env keys
//     (STAMP-MANAGED blocks re-rendered), so the workspace-contract gate and `bun env:generate
//     --check` hold inside the stamp
//   - live env files, worktrees, caches and rebuildable dist/ never ship; committed generated
//     workspaces (SDK dist + contracts bindings) always do
//
// Usage:
//   bun scripts/create-template.ts my-app
//   bun scripts/create-template.ts my-app --backends=typescript --frontends=react,astro
//   bun scripts/create-template.ts my-app --yes              # take defaults (all selected)
//   bun scripts/create-template.ts --help

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO } from '../template.config'
import { applyStamp } from './create-template/apply'
import { backendAliases, frontendAliases, planStamp, type StampSelection } from './create-template/plan'

// Selection tokens are workspace ALIASES — owned by template.config.ts REPO.workspaces (language
// is a workspace property, never inferred from a name; a fork may alias its TS backend 'main-back').
const ALL_BACKENDS = backendAliases(REPO)
const ALL_FRONTENDS = frontendAliases(REPO)

interface Options extends StampSelection {
	dest: string
	skipInstall: boolean
}

const USAGE = `create-template — stamp a pruned copy of this monorepo template.

Usage:
  bun scripts/create-template.ts <project-name> [options]

Options:
  --backends=<list>    Comma-separated subset of: ${ALL_BACKENDS.join(', ')} (default: all)
  --frontends=<list>   Comma-separated subset of: ${ALL_FRONTENDS.join(', ')} (default: all)
  --yes, -y            Skip prompts; take defaults (all targets)
  --skip-install       Don't run bun install / bun contracts after stamping
  --help, -h           Show this help and exit
`

function parseArgs(): {
	projectName: string | undefined
	backends: string[] | undefined
	frontends: string[] | undefined
	yes: boolean
	skipInstall: boolean
	help: boolean
} {
	const args = process.argv.slice(2)
	let projectName: string | undefined
	let backends: string[] | undefined
	let frontends: string[] | undefined
	let yes = false
	let skipInstall = false
	let help = false
	for (const arg of args) {
		if (arg === '--help' || arg === '-h') help = true
		else if (arg === '--yes' || arg === '-y') yes = true
		else if (arg === '--skip-install') skipInstall = true
		else if (arg.startsWith('--backends=')) {
			backends = arg
				.slice('--backends='.length)
				.split(',')
				.map(s => s.trim())
				.filter(s => ALL_BACKENDS.includes(s))
		} else if (arg.startsWith('--frontends=')) {
			frontends = arg
				.slice('--frontends='.length)
				.split(',')
				.map(s => s.trim())
				.filter(s => ALL_FRONTENDS.includes(s))
		} else if (!arg.startsWith('-') && !projectName) {
			projectName = arg
		}
	}
	return { projectName, backends, frontends, yes, skipInstall, help }
}

async function prompt(question: string, defaultValue: string): Promise<string> {
	process.stdout.write(`${question} [${defaultValue}] `)
	const chunk = await new Promise<string>(res => {
		process.stdin.once('data', d => res(d.toString().trim()))
	})
	return chunk || defaultValue
}

async function multiSelect(question: string, choices: readonly string[]): Promise<string[]> {
	process.stdout.write(`${question}\n`)
	process.stdout.write(`  Options: ${choices.join(', ')}\n  (comma-separated; ENTER for all) > `)
	const chunk = await new Promise<string>(res => {
		process.stdin.once('data', d => res(d.toString().trim()))
	})
	if (!chunk) return [...choices]
	const picked = chunk
		.split(',')
		.map(s => s.trim())
		.filter(s => (choices as readonly string[]).includes(s))
	return picked.length > 0 ? picked : [...choices]
}

async function gather(): Promise<Options> {
	const cli = parseArgs()
	const projectName = cli.projectName ?? (cli.yes ? 'my-app' : await prompt('Project name?', 'my-app'))
	const dest = resolve(process.cwd(), projectName)
	const backends = cli.backends ?? (cli.yes ? [...ALL_BACKENDS] : await multiSelect('Backends to include?', ALL_BACKENDS))
	const frontends = cli.frontends ?? (cli.yes ? [...ALL_FRONTENDS] : await multiSelect('Frontends to include?', ALL_FRONTENDS))
	return { projectName, dest, backends, frontends, skipInstall: cli.skipInstall }
}

function run(cmd: string, args: string[], cwd: string): void {
	const result = spawnSync(cmd, args, { cwd, stdio: 'inherit' })
	if (result.status !== 0) {
		throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${result.status}`)
	}
}

async function main(): Promise<void> {
	if (parseArgs().help) {
		process.stdout.write(USAGE)
		return
	}

	const templateRoot = resolve(import.meta.dirname, '..')
	const opts = await gather()

	if (existsSync(opts.dest)) {
		throw new Error(`destination already exists: ${opts.dest}`)
	}

	console.log(`\n→ Stamping template into ${opts.dest}`)
	console.log(`  backends:  ${opts.backends.join(', ') || '(none)'}`)
	console.log(`  frontends: ${opts.frontends.join(', ') || '(none)'}`)

	const plan = planStamp(REPO, opts)
	await applyStamp(plan, { srcDir: templateRoot, destDir: opts.dest })

	if (opts.skipInstall) {
		console.log(`\n✔ done (install skipped). Next:`)
		console.log(`  cd ${opts.projectName} && bun install && bun contracts && bun dev`)
		return
	}

	console.log(`\n→ Running bun install in ${opts.dest}`)
	run('bun', ['install'], opts.dest)

	console.log(`\n→ Running bun contracts in ${opts.dest}`)
	try {
		run('bun', ['run', 'contracts'], opts.dest)
	} catch {
		console.warn(`(contracts step failed — likely needs codegen deps that just installed; run \`bun contracts\` manually)`)
	}

	console.log(`\n✔ done. Next:`)
	console.log(`  cd ${opts.projectName}`)
	console.log(`  bun stack:up`)
	console.log(`  bun migrate:dev`)
	console.log(`  bun dev`)
}

await main()

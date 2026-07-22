#!/usr/bin/env bun

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { backendContextCommands, contextExists, generateFullContext, resolveLang } from './cli/backend'
import { getGenerators, resolvePlatform } from './cli/resolve'
import type { GeneratedFile } from './cli/types'
import { wireGeneratedFile } from './cli/wire'

// --- Argument Parsing ---

function parseFlags(args: string[]): { flags: Record<string, string>; positional: string[] } {
	const flags: Record<string, string> = {}
	const positional: string[] = []

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]
		if (!arg) continue

		if (arg.startsWith('--')) {
			const body = arg.substring(2)
			const eq = body.indexOf('=')
			if (eq !== -1) {
				// --flag=value form (spec §5 conventions)
				flags[body.slice(0, eq)] = body.slice(eq + 1)
			} else {
				// --flag form: peek at the next arg
				const nextArg = args[i + 1]
				if (nextArg && !nextArg.startsWith('-')) {
					flags[body] = nextArg
					i++
				} else {
					flags[body] = 'true'
				}
			}
		} else if (arg.startsWith('-') && arg.length === 2) {
			const flagName = arg.substring(1)
			const nextArg = args[i + 1]
			if (nextArg && !nextArg.startsWith('-')) {
				flags[flagName] = nextArg
				i++
			} else {
				flags[flagName] = 'true'
			}
		} else {
			positional.push(arg)
		}
	}

	return { flags, positional }
}

const { flags: globalFlags, positional: globalPositional } = parseFlags(process.argv.slice(2))
const command = globalPositional[0]
const isPrint = globalFlags.print === 'true'

const ROOT = process.cwd()

// --- Output ---

function printFiles(files: GeneratedFile[]): void {
	const out = files
		.map(f => {
			const lines: string[] = []
			lines.push(`// FILE: ${f.filePath}`)
			if (f.exportLine) lines.push(`// EXPORT: ${f.exportLine}`)
			if (f.exportTarget) lines.push(`// EXPORT_TARGET: ${f.exportTarget}`)
			lines.push(f.content)
			return lines.join('\n')
		})
		.join('\n// ---\n')

	process.stdout.write(out)
}

async function writeFiles(files: GeneratedFile[]): Promise<void> {
	for (const f of files) {
		const absPath = join(ROOT, f.filePath)
		await mkdir(join(absPath, '..'), { recursive: true })
		await writeFile(absPath, f.content)
		console.log(`Created ${f.filePath}`)
		const wired = await wireGeneratedFile(f, ROOT)
		if (wired === 'wired') {
			console.log(`  Wired ${f.exportTarget}: ${f.exportLine}`)
		} else if (wired === 'already-wired') {
			console.log(`  Already wired in ${f.exportTarget}`)
		} else if (f.exportLine && f.exportTarget) {
			// Non-export hints (registry.ts DI bindings, Go module.go fx wiring) stay manual.
			console.log(`  Export in ${f.exportTarget}: ${f.exportLine}`)
		}
	}
}

async function output(files: GeneratedFile[]): Promise<void> {
	if (isPrint) {
		printFiles(files)
	} else {
		await writeFiles(files)
	}
}

// --- Help ---

function showHelp() {
	console.log(`
Scaffold CLI — Generate backend & frontend artifacts

USAGE:
  bun cli <command> [args] [flags]

GLOBAL FLAGS:
  --print              Output template to stdout (for agent consumption)
  --lang=<lang>        Target backend language: typescript | go
                       (default: inferred from cwd, else typescript)
                       Aliases: ts → typescript
  --help, -h           Show this help

BACKEND LANG SUPPORT:
  typescript           Fully implemented (default)
  go                   Skill playbooks ready in .claude/skills/<skill>/go/SKILL.md;
                       template code generator NOT YET implemented

BACKEND COMMANDS:
  context <name>                                      Full context structure
  entity <ctx> <name> [--aggregate]                   Domain entity
  value-object <ctx> <name> [--primitive]             Value object
  usecase <ctx> <name> [--internal]                   Application use case
  controller <ctx> <name> [--internal] [-m M] [-p P]  HTTP controller
  handler <ctx> <name> [--external]                   Event handler
  service <ctx> <name>                                Domain service
  event <ctx> <name> [--integration]                  Domain/integration event
  middleware <ctx> <name>                              HTTP middleware
  enum <ctx> <name>                                   Domain enum
  repository <ctx> <entityName>                       Repository (2 files)
  schema <ctx> <name>                                 Reusable Zod schema
  errors <ctx>                                        Error types for context
  query <name>                                        BFF query (ui/usecases)
  projection <ctx> <Name>                             Projection + ProjectionRepository (2 files)
  projector <ctx> <Name>                              Projector (one per Projection)

FRONTEND COMMANDS (full reference: docs/CLI.md):
  route <path> --i18n=<prefix> [...]                  TanStack route + search schema
  component <route> <Name> [--recipe=...] [...]       Recipe-driven component (plain|section|card|empty-state)
  dialog <route> <Name> --crud=...                    CRUD dialog (create|update|delete|confirm)
  form <route> <Name> --i18n=... (--from|--fields)    Form scaffolder
  onboarding-step <Name> --from=... --i18n=...        Onboarding wizard step
  i18n <namespace> --keys=...                         Lock-step PT/EN locale writer
  mask <name> --pattern=...                           Maskito options export
  store <name>                                        Zustand store
  primitive <name>                                    UI primitive (CVA)

GRAPH COMMANDS:
  graph build                                         Extract full code graph
  graph why <node-id>                                 Upstream tree
  graph impact <node-id>                              Downstream tree
  graph path <a> <b>                                  Shortest path
  graph orphans                                       Nodes with no edges
  graph stats                                         Counts by kind
  graph render                                        Interactive HTML viewer (.graph/index.html)

EXAMPLES:
  bun cli entity product Product --aggregate --print
  bun cli controller product CreateProduct
  bun cli repository product Product --print
  bun cli projection channel Message --print
  bun cli projector channel Message --print
  bun cli route '(app)/patients' --extend=listPatientsQueryParamsSchema --sdk=Patient --i18n=patients
  bun cli component '(app)/patients' PatientCard --recipe=card --sdk=Patient --i18n=patients.card
  bun cli dialog '(app)/patients' CreatePatient --crud=create --sdk=Patient --mutation=useCreatePatient --i18n=patients.dialogs.create
  bun cli i18n patients --keys=title,subtitle --with-pt='title=Pacientes;subtitle=Lista'
  bun cli store ProductFilter --global
  bun cli primitive badge --print
`)
}

// --- Main ---

async function main() {
	if (!command || command === '--help' || command === '-h') {
		showHelp()
		return
	}

	const lang = resolveLang(globalFlags.lang)

	// Special case: context generates a full structure (no --print support)
	if (command === 'context') {
		const name = globalPositional[1]
		if (!name) {
			console.error('Usage: context <name> [--lang=typescript|go]')
			process.exit(1)
		}
		await generateFullContext(name, lang)
		return
	}

	// Special case: graph delegates to the graph CLI under scripts/ (lang-agnostic)
	if (command === 'graph') {
		const graphArgs = process.argv.slice(3)
		const proc = Bun.spawn(['bun', join(ROOT, 'scripts/graph/cli/index.ts'), ...graphArgs], {
			stdout: 'inherit',
			stderr: 'inherit',
			cwd: ROOT,
		})
		const exitCode = await proc.exited
		process.exit(exitCode)
		return
	}

	const platform = resolvePlatform(globalFlags.platform)
	const generators = getGenerators(lang, platform, command)
	const generator = generators[command]
	if (!generator) {
		console.error(`Unknown command: ${command}`)
		showHelp()
		process.exit(1)
	}

	// Parse command-specific args (everything after the command name)
	const { flags, positional } = parseFlags(process.argv.slice(3))
	// Merge global --print flag
	if (globalFlags.print) flags.print = globalFlags.print
	// Propagate resolved lang into the per-command flags so generators can read it.
	flags.lang = lang

	// Validate context exists (for backend commands that need it)
	if ((backendContextCommands as readonly string[]).includes(command) && positional[0]) {
		const ctx = positional[0]
		const isIntegrationEvent = command === 'event' && flags.integration === 'true'
		if (!isIntegrationEvent && command !== 'errors') {
			const exists = await contextExists(ctx, lang)
			if (!exists) {
				console.error(`Context "${ctx}" does not exist in packages/api/${lang}/. Create it first: bun cli context ${ctx} --lang=${lang}`)
				process.exit(1)
			}
		}
	}

	const files = await generator(positional, flags)
	await output(files)
}

main()

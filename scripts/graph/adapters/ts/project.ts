import { Project, ScriptTarget } from 'ts-morph'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../../core/paths'
import { IGNORE_TS, type Workspace, workspaceById, workspacesByRole } from '../../core/config'

export interface AdapterProject {
	workspaceId: string
	project: Project
	addedFiles: number
}

function makeProject(workspace: Workspace): AdapterProject {
	const tsConfigFilePath = workspace.tsconfig ? join(ROOT, workspace.tsconfig) : ''
	const project =
		tsConfigFilePath && existsSync(tsConfigFilePath)
			? new Project({
					tsConfigFilePath,
					skipAddingFilesFromTsConfig: true,
					skipFileDependencyResolution: true,
					skipLoadingLibFiles: true,
					compilerOptions: { target: ScriptTarget.ES2022, allowJs: false, declaration: false, noEmit: true },
				})
			: new Project({
					skipAddingFilesFromTsConfig: true,
					skipFileDependencyResolution: true,
					skipLoadingLibFiles: true,
					compilerOptions: { target: ScriptTarget.ES2022, allowJs: false, declaration: false, noEmit: true },
				})

	const src = join(ROOT, workspace.src)
	if (!existsSync(src)) return { workspaceId: workspace.id, project, addedFiles: 0 }

	const before = project.getSourceFiles().length
	project.addSourceFilesAtPaths([join(src, '**/*.ts'), join(src, '**/*.tsx'), ...IGNORE_TS.map(p => `!${p}`)])
	const added = project.getSourceFiles().length - before
	return { workspaceId: workspace.id, project, addedFiles: added }
}

const cache = new Map<string, AdapterProject>()

function getOrMakeProject(workspaceId: string): AdapterProject {
	const cached = cache.get(workspaceId)
	if (cached) return cached
	const ws = workspaceById(workspaceId)
	if (!ws) throw new Error(`Unknown workspace: ${workspaceId}`)
	const project = makeProject(ws)
	cache.set(workspaceId, project)
	return project
}

/** Per-workspace project accessor. */
export function getProject(workspaceId: string): AdapterProject {
	return getOrMakeProject(workspaceId)
}

/** All TS api workspaces — used by backend extractor to iterate. */
export function getBackendProjects(): AdapterProject[] {
	return workspacesByRole('api')
		.filter(w => w.lang === 'typescript' && !w.generated)
		.map(w => getOrMakeProject(w.id))
}

/** All app (frontend) workspaces — used by frontend extractor to iterate. */
export function getFrontendProjects(): AdapterProject[] {
	return workspacesByRole('app')
		.filter(w => !w.generated)
		.map(w => getOrMakeProject(w.id))
}

/** @deprecated use getBackendProjects() */
export function getBackendProject(): AdapterProject {
	return getOrMakeProject('api-typescript')
}

/** @deprecated use getFrontendProjects() */
export function getFrontendProject(): AdapterProject {
	return getOrMakeProject('app-react')
}

export function resetProjects(): void {
	cache.clear()
}

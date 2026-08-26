// Shared types between the top-level cli.ts entry and the frontend module.

export interface GeneratedFile {
	filePath: string
	content: string
	exportLine?: string
	exportTarget?: string
}

export type Generator = (positional: string[], flags: Record<string, string>) => GeneratedFile[] | Promise<GeneratedFile[]>

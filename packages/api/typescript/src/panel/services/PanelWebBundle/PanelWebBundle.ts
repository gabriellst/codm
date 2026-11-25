/** One servable file of the panel bundle: its bytes and the content type its extension names. */
export interface PanelWebAsset {
	body: Uint8Array<ArrayBuffer>
	contentType: string
}

/**
 * PORT — the cloud panel's built React app (spec 2026-11-24 §6): the HTML shell `GET /panel/g/:token` answers,
 * and the hashed files under `assets/` the shell loads from `/panel/assets/:file`.
 *
 * Abstract per environment so tests never read a disk: `real` reads the staged bundle once, `mock` and
 * `integration` answer a fixed shell.
 */
export abstract class PanelWebBundle {
	/** The shell document, or `undefined` when no bundle was built (dev without `build:panel`). */
	abstract shell(): string | undefined

	/**
	 * One file of `assets/`, by its EXACT name as the build wrote it — `undefined` for any other value. The set
	 * of names is read from the directory once; a request never builds a path (no traversal surface).
	 */
	abstract asset(file: string): PanelWebAsset | undefined
}

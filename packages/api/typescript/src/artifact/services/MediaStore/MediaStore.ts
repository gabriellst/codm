/** What staging an artifact's bytes into the shared media dir hands back. */
export interface StagedMedia {
	/** Absolute path under `<CODM_DATA_DIR>/media/` — what travels to the gateway as `mediaPath`. */
	mediaPath: string
	sha256: string
	sizeBytes: number
}

/**
 * Copies an artifact's bytes into the SAME content-addressed media dir the Go gateway already owns
 * for inbound downloads ("envio de artefatos pelo canal" design, decision 3) — `<CODM_DATA_DIR>/media/
 * <sha256>.<ext>`, atomic write (`.part` → rename), idempotent when the content is already there.
 *
 * ### Why the artifact's OWN `ref` is never handed to the gateway directly
 * `Artifact.ref` can be ANYWHERE an agent wrote a file (a workspace checkout, a scratch dir, a
 * download). The gateway's `mediaPath` acceptance is scoped to ITS OWN media dir (`MEDIA_PATH_NOT_
 * ALLOWED` otherwise, T1 of the plan) — the same posture inbound media already has. Staging is what
 * bridges the two: this store COPIES the bytes once into the directory the gateway trusts, so the S2S
 * hop never has to trust an arbitrary path the daemon read off a database row.
 *
 * ### Why a port, not a free function
 * `real` writes to disk under `CODM_DATA_DIR`, which defaults to the operator's real home directory
 * (`Config.ts`) — exactly the reason `ContactAvatarStore` binds a double in `mock`/`integration` rather
 * than let a test suite touch it. Same posture here: no test may write into `~/.codm/data/media`.
 */
export abstract class MediaStore {
	/**
	 * Stage `ref` (a local file path) into the media dir. Assumes the caller already verified the file
	 * EXISTS and is within the kind's size ceiling (`SendArtifact` — decision 6): this port only copies,
	 * it does not re-derive `ARTIFACT_FILE_MISSING`/`ARTIFACT_TOO_LARGE`.
	 */
	abstract stage(ref: string): Promise<StagedMedia>
}

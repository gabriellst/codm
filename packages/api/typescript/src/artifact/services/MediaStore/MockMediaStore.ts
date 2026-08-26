import { injectable } from 'tsyringe-neo'
import { createHash } from 'node:crypto'
import { MediaStore, type StagedMedia } from './MediaStore'

/**
 * Test/dev double, bound in `mock` AND `integration`: no disk write, no real `CODM_DATA_DIR` — the
 * same posture `MockContactAvatarStore` takes for the same reason (the real store's directory
 * defaults to the operator's actual home).
 *
 * The path is DETERMINISTIC (keyed off `ref`) rather than random, so a test asserting on
 * `sentMedia[0].mediaPath` (`MockChannelSender`) gets a stable value across runs without seeding.
 */
@injectable()
export class MockMediaStore extends MediaStore {
	/** Every `ref` staged, in order — the assertion surface for `SendArtifact` tests. */
	readonly staged: string[] = []

	async stage(ref: string): Promise<StagedMedia> {
		this.staged.push(ref)
		const sha256 = createHash('sha256').update(ref).digest('hex')
		return { mediaPath: `/mock-media-dir/${sha256}`, sha256, sizeBytes: 0 }
	}
}

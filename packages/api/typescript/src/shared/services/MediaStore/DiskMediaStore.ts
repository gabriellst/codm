import { injectable } from 'tsyringe-neo'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { Config, resolveDataDir } from '@codm/core-typescript'
import { MediaStore, type StagedMedia } from './MediaStore'

/** Sibling of the Go gateway's own media dir — `MediaStore.Dir()` in `media_store.go`. */
const MEDIA_SUBDIR = 'media'

/**
 * The real store: content-addressed, atomic, idempotent — the SAME layout and write discipline as
 * the Go gateway's `MediaStore` (mirrored deliberately, per the design's decision 3).
 *
 * The staged file keeps `ref`'s own extension rather than deriving one from a sniffed mimetype: `ref`
 * already names a real extension (the agent that wrote the artifact chose it), so re-deriving one from
 * bytes would be a second, independent guess that can disagree with the first — exactly the kind of
 * duplicated table `MimeTypeExtractor` exists to avoid re-inventing.
 */
@injectable()
export class DiskMediaStore extends MediaStore {
	async stage(ref: string): Promise<StagedMedia> {
		const data = await readFile(ref)
		const sha256 = createHash('sha256').update(data).digest('hex')
		const dir = join(resolveDataDir(Config.env.CODM_DATA_DIR), MEDIA_SUBDIR)
		const mediaPath = join(dir, `${sha256}${extname(ref).toLowerCase()}`)

		// Content-addressed dedupe: identical bytes already staged means nothing to write.
		const already = await stat(mediaPath).catch(() => undefined)
		if (!already) {
			await mkdir(dir, { recursive: true })
			const staging = `${mediaPath}.part`
			await writeFile(staging, data)
			await rename(staging, mediaPath)
		}

		return { mediaPath, sha256, sizeBytes: data.byteLength }
	}
}

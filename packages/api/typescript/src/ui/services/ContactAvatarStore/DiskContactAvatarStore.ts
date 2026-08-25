import { injectable } from 'tsyringe-neo'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Config, MimeTypeExtractor, MimeTypes, resolveDataDir } from '@codm/core-typescript'
import { ContactAvatarStore, type ContactAvatarBytes } from './ContactAvatarStore'

/** Where the cached photos live, under the same data dir that holds `codm.db`. */
const AVATARS_SUBDIR = 'avatars'

/**
 * The default a photo gets when its url names no extension we know. WhatsApp serves JPEG and the
 * path says `.jpg`, so this is the answer for a url shaped unlike the ones we have seen — declaring
 * `application/octet-stream` (what `MimeTypeExtractor` returns for an unknown extension) would make
 * the browser offer to DOWNLOAD an `<img src>` instead of drawing it.
 */
const FALLBACK_CONTENT_TYPE: string = MimeTypes['.jpg']

/**
 * The real store: a content-addressed cache under `<CODM_DATA_DIR>/avatars/`, filled on first miss
 * from the signed CDN url.
 *
 * ### The cache key is the url MINUS its query string
 * A signed url is re-minted on every gateway sync — same photo, new `oh`/`oe` signature — so keying
 * on the whole url would re-download an unchanged image every time the contact book refreshes.
 * `origin + pathname` is the part that identifies the PHOTO: WhatsApp puts the media id in the path,
 * so a contact who changes their picture gets a different path and therefore a different file here,
 * which is exactly the invalidation we want and the reason this is not keyed on
 * `(channelId, remoteId)` — that key would serve a stale face forever.
 *
 * The cost of that choice is that a replaced photo leaves its predecessor on disk. That is bounded
 * by "how many times the operator's contacts changed their picture", each entry a few dozen KB, and
 * the alternative (delete-then-write per remote) trades it for a cache that misses on every
 * concurrent read.
 *
 * ### Writes are atomic
 * `write to <hash>.part → rename` — `rename` within a directory is atomic on every filesystem we
 * run on, so a reader never opens a half-written file. Two requests racing for the same cold avatar
 * both fetch and both rename; the last one wins and the bytes are identical either way.
 */
@injectable()
export class DiskContactAvatarStore extends ContactAvatarStore {
	async get(sourceUrl: string): Promise<ContactAvatarBytes | undefined> {
		const identity = photoIdentity(sourceUrl)
		if (!identity) return undefined

		const contentType = contentTypeFor(identity.pathname)
		const dir = join(resolveDataDir(Config.env.CODM_DATA_DIR), AVATARS_SUBDIR)
		const path = join(dir, identity.key)

		const cached = await readFile(path).catch(() => undefined)
		if (cached) return { bytes: new Uint8Array(cached), contentType }

		const bytes = await fetchBytes(sourceUrl)
		if (!bytes) return undefined

		// A cache that cannot be written is not a failure of the READ — the operator still gets their
		// avatar, it just costs a round trip next time. Swallowing here keeps a read-only data dir
		// from turning every contact photo into a 404.
		await mkdir(dir, { recursive: true })
			.then(async () => {
				const staging = `${path}.part`
				await writeFile(staging, bytes)
				await rename(staging, path)
			})
			.catch(() => undefined)

		return { bytes, contentType }
	}
}

/** The stable identity of the photo a signed url points at — see the class docblock. */
function photoIdentity(sourceUrl: string): { key: string; pathname: string } | undefined {
	let url: URL
	try {
		url = new URL(sourceUrl)
	} catch {
		return undefined
	}
	// Only http(s). A `file:` url in this column would turn the avatar endpoint into an arbitrary
	// local-file reader driven by a value the Go gateway wrote.
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
	return { key: createHash('sha256').update(`${url.origin}${url.pathname}`).digest('hex'), pathname: url.pathname }
}

function contentTypeFor(pathname: string): string {
	const extracted = MimeTypeExtractor.extractMimeType(pathname)
	return extracted === MimeTypes['.bin'] ? FALLBACK_CONTENT_TYPE : extracted
}

async function fetchBytes(sourceUrl: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
	const response = await fetch(sourceUrl).catch(() => undefined)
	if (!response?.ok) return undefined
	const buffer: ArrayBuffer | undefined = await response.arrayBuffer().catch(() => undefined)
	if (!buffer) return undefined
	return new Uint8Array(buffer)
}

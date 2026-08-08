/**
 * The bytes of one contact photo, plus the media type to declare when serving them.
 *
 * `Uint8Array<ArrayBuffer>` and not a bare `Uint8Array` (whose buffer parameter defaults to
 * `ArrayBufferLike`, i.e. "possibly SHARED"): a `Response` body cannot be backed by a
 * SharedArrayBuffer, so `BodyInit` excludes that case. Naming the narrower type here is what lets
 * the controller hand these straight to `new Response(...)` with no cast — the alternative is a
 * widened type that only type-checks at the seam by lying about what it holds.
 */
export interface ContactAvatarBytes {
	bytes: Uint8Array<ArrayBuffer>
	contentType: string
}

/**
 * THE PHOTO BEHIND A SIGNED URL — fetched once, kept on this machine, served from here forever after.
 *
 * ### Why the daemon holds the bytes at all
 * `gateway_remotes.avatar_url` is a SIGNED CDN url (`https://pps.whatsapp.net/...`) with an
 * expiry baked into the query string. Two things follow, and each alone would be enough:
 *
 *   1. The console's CSP is `img-src 'self' data: blob:` plus the daemon's own origins — the CDN is
 *      not on it, and putting it there would let every avatar render leak the operator's IP to Meta
 *      on every paint. The daemon fetching once, from the machine the operator already trusts with
 *      their whole WhatsApp session, is strictly less exposure than the browser fetching always.
 *   2. The url EXPIRES. A read model that handed the browser a url would ship a link that works for
 *      an hour and then renders a broken image, with nothing in the product able to tell the
 *      difference between "expired" and "this contact has no photo".
 *
 * ### Why it is a port
 * The real implementation opens a socket. Under `mock` and `integration` nothing may — a test that
 * needs a network to pass is a test that fails when a CDN does. Same posture as `CloudSession` and
 * `ChannelSender`: the socket lives behind an abstract bound per environment.
 */
export abstract class ContactAvatarStore {
	/**
	 * The bytes for `sourceUrl`, from cache when they are already here and from the origin when they
	 * are not. `undefined` means "there is no image to serve" — an unreachable origin, a non-2xx
	 * answer, a url that is not a url. Every one of those is the SAME outcome for the console (fall
	 * back to the contact's initials), so distinguishing them here would only invent an error the
	 * caller has nothing to do with.
	 */
	abstract get(sourceUrl: string): Promise<ContactAvatarBytes | undefined>
}

import { MimeTypes } from '../types/Http'

/**
 * Extension → media type, for the one case where a server has to declare what it is about to send
 * and the only evidence it has is the file's name.
 *
 * It is EVIDENCE, not proof: the extension is what the producer wrote, and a `.png` holding a PDF
 * resolves to `image/png` here and fails to render at the other end. Sniffing magic bytes is the
 * complete answer and deliberately not this — the callers on this codepath serve files the operator's
 * own agents wrote to the operator's own disk, and the cost of a wrong guess is a preview that falls
 * back to a download link.
 *
 * Unknown extension → `application/octet-stream`, which is the honest answer for "bytes, of a kind I
 * cannot name" and the one that makes a browser offer to save rather than try to interpret.
 */
export class MimeTypeExtractor {
	/** The media type to declare for `filePath`. Case-insensitive on the extension. */
	static extractMimeType(filePath: string): MimeTypes {
		const extension = MimeTypeExtractor.extractFileExtension(filePath)
		return MimeTypes[extension as keyof typeof MimeTypes] || MimeTypes['.bin']
	}

	private static extractFileExtension(filePath: string): string {
		const lastDotIndex = filePath.lastIndexOf('.')
		if (lastDotIndex === -1) {
			return '.bin'
		}

		const extension = filePath.substring(lastDotIndex)
		return extension.toLowerCase()
	}
}

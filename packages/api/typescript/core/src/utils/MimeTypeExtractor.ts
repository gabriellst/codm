import { MimeTypes } from '../types/Http'

export class MimeTypeExtractor {
	static extractMimeType(filePath: string): string {
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

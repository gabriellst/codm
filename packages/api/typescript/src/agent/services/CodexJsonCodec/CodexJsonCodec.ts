import { LineBuffer } from '../StreamJsonCodec'
import { CodexFrameDecoder, type CodexDecodedLine } from './CodexFrameDecoder'

export class CodexJsonCodec {
	private readonly lines = new LineBuffer()
	private readonly decoder: CodexFrameDecoder

	constructor(private readonly options: { onWarn?: (message: string) => void } = {}) {
		this.decoder = new CodexFrameDecoder()
	}

	push(chunk: string | Uint8Array): CodexDecodedLine[] {
		return this.decode(this.lines.push(chunk))
	}

	flush(): CodexDecodedLine[] {
		return this.decode(this.lines.flush())
	}

	private decode(lines: string[]): CodexDecodedLine[] {
		const decoded: CodexDecodedLine[] = []
		for (const line of lines) {
			if (!line.trim()) continue
			try {
				decoded.push(this.decoder.decode(JSON.parse(line)))
			} catch {
				this.options.onWarn?.(`unparseable Codex JSONL line: ${line.slice(0, 160)}`)
			}
		}
		return decoded
	}
}

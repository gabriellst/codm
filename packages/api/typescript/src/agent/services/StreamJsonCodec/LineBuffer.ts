/**
 * Line-buffered JSONL reassembly — the first half of the codec, and the one that has to be boring.
 *
 * A pipe hands us bytes, not lines: one `data` chunk routinely ends mid-object (the `system/init`
 * frame of the real capture is 5555 bytes, `hook_response` is 7553), and two frames routinely arrive
 * in the same chunk. Everything downstream assumes "one complete line = one candidate frame", so the
 * reassembly lives here alone and nothing else in the codec looks at chunk boundaries.
 *
 * `TextDecoder({ stream: true })` rather than `chunk.toString()`: a multi-byte UTF-8 character split
 * across two chunks would otherwise decode to two replacement characters and corrupt the JSON.
 *
 * PURE — no I/O, no timers, no spawn. The runner feeds it; it never reads anything itself (AC-2.5).
 */
export class LineBuffer {
	private buffer = ''
	private readonly decoder = new TextDecoder()

	/** Append a chunk and return every COMPLETE line it closed. A trailing partial line stays buffered. */
	push(chunk: string | Uint8Array): string[] {
		this.buffer += typeof chunk === 'string' ? chunk : this.decoder.decode(chunk, { stream: true })
		const lines: string[] = []
		let newline = this.buffer.indexOf('\n')
		while (newline !== -1) {
			lines.push(this.buffer.slice(0, newline).replace(/\r$/, ''))
			this.buffer = this.buffer.slice(newline + 1)
			newline = this.buffer.indexOf('\n')
		}
		return lines
	}

	/**
	 * Release whatever is still buffered when the stream ends without a final newline.
	 *
	 * Deliberately NOT discarded: a process killed by the watchdog mid-frame leaves a truncated line
	 * here, and surfacing it lets the decoder report one unparseable line rather than silently losing
	 * evidence. The decoder is what decides it is garbage — this class never parses.
	 */
	flush(): string[] {
		const rest = this.buffer
		this.buffer = ''
		return rest.length > 0 ? [rest] : []
	}
}

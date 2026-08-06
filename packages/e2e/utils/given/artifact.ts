import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { recordArtifact } from '@codm/client-typescript/typescript'
import type { ArtifactKind } from '@codm/client-typescript/typescript'
import type { ApiSession } from './api'

/**
 * Fixture media for the artifact-preview spec.
 *
 * EVERY BYTE IS SYNTHESIZED HERE, on purpose. The preview falls back to a plain file row whenever the
 * browser cannot decode what it was handed (`onError` on the media element), so a fixture that is
 * "some bytes with the right extension" would make the spec pass while screenshotting the FALLBACK —
 * the exact failure the spec exists to catch. These produce genuinely decodable files with no
 * external tool (no ffmpeg on the build host) and no committed binary blob:
 *
 *  - WAV: 16-bit PCM, which every browser decodes without a proprietary codec.
 *  - PNG / WebM: not here — those come from Playwright itself (a real screenshot, a real recorded
 *    video), so the file that gets rendered was produced by the same engine that renders it.
 */

/** RIFF/WAVE header + 16-bit signed PCM samples, mono. */
function pcmWav(samples: Int16Array, sampleRate: number): Buffer {
	const data = Buffer.alloc(samples.length * 2)
	for (const [i, sample] of samples.entries()) data.writeInt16LE(sample, i * 2)

	const header = Buffer.alloc(44)
	header.write('RIFF', 0)
	header.writeUInt32LE(36 + data.length, 4)
	header.write('WAVE', 8)
	header.write('fmt ', 12)
	header.writeUInt32LE(16, 16) // PCM chunk size
	header.writeUInt16LE(1, 20) // format 1 = PCM
	header.writeUInt16LE(1, 22) // mono
	header.writeUInt32LE(sampleRate, 24)
	header.writeUInt32LE(sampleRate * 2, 28) // byte rate (1 channel × 2 bytes)
	header.writeUInt16LE(2, 32) // block align
	header.writeUInt16LE(16, 34) // bits per sample
	header.write('data', 36)
	header.writeUInt32LE(data.length, 40)

	return Buffer.concat([header, data])
}

/**
 * A short spoken-note-shaped tone: an A440 that fades out, so the player's waveform/duration is a
 * real duration and not a zero-length stub.
 */
export function writeSampleWav(dir: string, fileName = 'nota-de-voz.wav'): string {
	const sampleRate = 22_050
	const seconds = 2
	const total = sampleRate * seconds
	const samples = new Int16Array(total)
	for (let i = 0; i < total; i++) {
		const t = i / sampleRate
		const fade = 1 - t / seconds
		samples[i] = Math.round(Math.sin(2 * Math.PI * 440 * t) * 12_000 * fade)
	}
	const path = join(dir, fileName)
	writeFileSync(path, pcmWav(samples, sampleRate))
	return path
}

/** A plain-text artifact — the kind with no player, which must render as an openable row. */
export function writeSampleFile(dir: string, fileName = 'relatorio-da-issue.md'): string {
	const path = join(dir, fileName)
	writeFileSync(
		path,
		['# Relatório da issue', '', '- 3 arquivos alterados', '- 12 testes novos, todos verdes', '- tsc e lint limpos', ''].join('\n'),
	)
	return path
}

/** Record one artifact through the REAL endpoint the MCP tool uses (C30). */
export async function givenArtifact(
	session: ApiSession,
	input: { threadId: string; kind: ArtifactKind; name: string; ref: string; meta?: string },
): Promise<string> {
	const { artifactId } = await recordArtifact(
		input.threadId,
		{ kind: input.kind, name: input.name, ref: input.ref, meta: input.meta ?? '' },
		{ client: session.client },
	)
	return artifactId
}

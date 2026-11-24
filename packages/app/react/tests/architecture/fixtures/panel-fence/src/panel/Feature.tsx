// Negative fixture: one relative hop on, still innocent-looking — but it renders markup from data, and the
// helper it imports is what drags the desktop in.
import { helper } from '../lib/helper'

export function Feature({ html }: { html: string }) {
	return <div data-helper={helper} dangerouslySetInnerHTML={{ __html: html }} />
}

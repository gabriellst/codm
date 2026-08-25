import IORedis from 'ioredis'
import { Config } from '../../utils/Config'
import { RateLimitStore, type RateLimitResult } from './RateLimitStore'

const KEY_PREFIX = 'ratelimit:'

// Atomic fixed-window: increment, and set the window TTL only on the first hit.
const HIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return current
`

export class RedisRateLimitStore extends RateLimitStore {
	private redis = new IORedis(Config.env.REDIS_URL, { maxRetriesPerRequest: null })

	async hit(key: string, windowMs: number, max: number): Promise<RateLimitResult> {
		const current = Number(await this.redis.eval(HIT_SCRIPT, 1, KEY_PREFIX + key, windowMs))
		return { allowed: current <= max, remaining: Math.max(0, max - current) }
	}
}

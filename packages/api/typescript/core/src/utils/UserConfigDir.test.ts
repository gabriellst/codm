import { describe, expect, it } from 'bun:test'
import { BaseError } from '../types/BaseError'
import { defaultDataDir, userConfigDir } from './UserConfigDir'

/**
 * Transcrição de `os.UserConfigDir()` do Go, que é o que `resolveDataDir("")` do gateway usa
 * (`packages/api/go/core/db/sqlite/store.go:339-345`). Um caso por linha da tabela e um por recusa —
 * o daemon standalone e o gateway têm de abrir o mesmo arquivo de banco (`<produto>.db`) em
 * qualquer SO, ou o operador vê dois bancos e nenhum erro.
 */
describe('userConfigDir — os.UserConfigDir() do Go, por plataforma', () => {
	it('darwin → $HOME/Library/Application Support', () => {
		expect(userConfigDir({ platform: 'darwin', env: {}, home: '/Users/dev' })).toBe('/Users/dev/Library/Application Support')
	})

	it('win32 → %AppData%, e o join usa a barra invertida do Windows (filepath.Join)', () => {
		const env = { APPDATA: 'C:\\Users\\dev\\AppData\\Roaming' }
		expect(userConfigDir({ platform: 'win32', env, home: 'C:\\Users\\dev' })).toBe('C:\\Users\\dev\\AppData\\Roaming')
		expect(defaultDataDir({ platform: 'win32', env, home: 'C:\\Users\\dev' }, 'acme')).toBe('C:\\Users\\dev\\AppData\\Roaming\\acme')
	})

	it('win32 sem %AppData% recusa — o Go devolve "%AppData% is not defined"', () => {
		expect(() => userConfigDir({ platform: 'win32', env: {}, home: 'C:\\Users\\dev' })).toThrow(BaseError)
	})

	it('linux → $XDG_CONFIG_HOME quando definido e absoluto', () => {
		expect(defaultDataDir({ platform: 'linux', env: { XDG_CONFIG_HOME: '/xdg' }, home: '/home/dev' }, 'acme')).toBe('/xdg/acme')
	})

	it.each([
		['ausente', {}],
		['vazio', { XDG_CONFIG_HOME: '' }],
	])('linux → $HOME/.config quando XDG_CONFIG_HOME está %s', (_label, env) => {
		expect(defaultDataDir({ platform: 'linux', env, home: '/home/dev' }, 'acme')).toBe('/home/dev/.config/acme')
	})

	it('linux com XDG_CONFIG_HOME relativo recusa — o Go devolve "path in $XDG_CONFIG_HOME is relative"', () => {
		expect(() => userConfigDir({ platform: 'linux', env: { XDG_CONFIG_HOME: 'rel/config' }, home: '/home/dev' })).toThrow(BaseError)
	})

	it('qualquer outro unix (freebsd) cai na regra XDG, como o default do switch do Go', () => {
		expect(defaultDataDir({ platform: 'freebsd', env: {}, home: '/home/dev' }, 'acme')).toBe('/home/dev/.config/acme')
	})

	it.each([['darwin'], ['linux']] as const)('%s sem $HOME recusa, como o Go', platform => {
		expect(() => userConfigDir({ platform, env: {}, home: '' })).toThrow(BaseError)
	})

	it('o nome da pasta é o produto que o chamador declara — nunca escrito à mão aqui', () => {
		expect(defaultDataDir({ platform: 'darwin', env: {}, home: '/Users/dev' }, 'acme')).toBe('/Users/dev/Library/Application Support/acme')
	})
})

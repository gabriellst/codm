import { describe, expect, it } from 'bun:test'
import type { ApiSource } from '../discover'
import { renderLibRs } from './rust'

/**
 * A IDENTIDADE DE SAÍDA DOS AGREGADOS — `clientId`, nunca `service`.
 *
 * ── o defeito que este arquivo existe para não deixar voltar ─────────────────────────────────────
 * Desde o ADR 0001 o MESMO serviço publica DUAS superfícies: o daemon local e o deployment de nuvem.
 * `discoverApis` devolve uma fonte por (serviço, perfil), e `service` é `'typescript'` nas duas — só
 * `clientId` distingue (`typescript` × `typescript-cloud`).
 *
 * O renderizador Rust chaveava por `service` e emitiu `pub mod typescript;` **duas vezes**. O crate
 * parou de compilar (*the name `typescript` is defined multiple times*), e com ele o shell Tauri,
 * que o tem como dependência de caminho — ou seja, `bun dev` do desktop deixou de subir.
 *
 * ── por que nada pegou ───────────────────────────────────────────────────────────────────────────
 * Os geradores TS e Go já usavam `clientId`; só o Rust ficou para trás. E não havia teste algum sobre
 * os renderizadores de agregado — a única coisa que reprovava era o `cargo` de um crate que nenhum
 * gate de TypeScript compila. O defeito atravessou a onda inteira e apareceu para o founder.
 *
 * O caso AGR-01 é o falseador permanente: reverter `clientId` para `service` em `render/rust.ts` o
 * deixa vermelho nomeando o módulo duplicado.
 */

const source = (service: string, profile: 'local' | 'cloud', clientId: string): ApiSource => ({
	service,
	profile,
	clientId,
	specPath: `/tmp/${clientId}.json`,
})

describe('renderLibRs — a identidade de saída é o `clientId`', () => {
	it('AGR-01: duas superfícies do MESMO serviço viram DOIS módulos distintos', () => {
		const rendered = renderLibRs([
			{ source: source('typescript', 'local', 'typescript') },
			{ source: source('typescript', 'cloud', 'typescript-cloud') },
		])

		const mods = [...rendered.matchAll(/^pub mod (\w+);$/gm)].map(m => m[1])
		expect(mods, 'chavear por `service` emitiria `typescript` duas vezes e o crate não compila').toEqual(['typescript', 'typescript_cloud'])
		expect(new Set(mods).size, 'nenhum nome de módulo pode repetir').toBe(mods.length)
	})

	it('AGR-02: o `#[path]` aponta para o DIRETÓRIO real, que é o `clientId` cru', () => {
		const rendered = renderLibRs([{ source: source('typescript', 'cloud', 'typescript-cloud') }])

		// O identificador Rust normaliza o hífen (`typescript_cloud`), mas o caminho em disco NÃO —
		// progenitor escreve em `src/typescript-cloud/mod.rs`. Confundir os dois dá um `#[path]` que
		// aponta para pasta inexistente, e o erro sai longe da causa.
		expect(rendered).toContain('#[path = "typescript-cloud/mod.rs"]')
		expect(rendered).toContain('pub mod typescript_cloud;')
	})

	it('AGR-03: os campos, setters e o erro de URL ausente também usam o `clientId`', () => {
		const rendered = renderLibRs([{ source: source('typescript', 'cloud', 'typescript-cloud') }])

		expect(rendered, 'o campo do Client').toContain('pub typescript_cloud: typescript_cloud::Client,')
		expect(rendered, 'o campo do builder').toContain('typescript_cloud_url: Option<String>,')
		expect(rendered, 'o setter que o chamador usa').toContain('pub fn typescript_cloud(mut self, url: impl Into<String>) -> Self {')
		// A mensagem de erro nomeia o que o chamador tem de setar. Dizer `typescript` aqui mandaria
		// alguém procurar o setter errado.
		expect(rendered).toContain('BuildError::MissingUrl("typescript-cloud")')
	})

	it('AGR-04: com UMA superfície só, nada muda — o perfil `local` mantém o nome histórico', () => {
		// A regra é a do `clientIdOf`: `local` fica com o nome do serviço, para que um repo de uma
		// superfície só nunca aprenda que existe um eixo de perfil.
		const rendered = renderLibRs([{ source: source('go', 'local', 'go') }])
		expect(rendered).toContain('pub mod go;')
		expect(rendered).toContain('#[path = "go/mod.rs"]')
	})
})

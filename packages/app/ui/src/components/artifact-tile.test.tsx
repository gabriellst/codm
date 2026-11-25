import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ArtifactChip, ArtifactTile, artifactThumbVariants } from './artifact-tile'

/**
 * ARTIFACT TILE / CHIP — o tom pinta a miniatura, e o `render` decide o que é abrir.
 *
 * Link tem a miniatura em `--accent` com glifo verde; arquivo/imagem ficam no `--card`. O componente
 * não sabe o que é abrir: sem `render` é um bloco inerte; com `render={<a href>}` é o próprio link
 * (um só elemento interativo, sem botão dentro de link).
 */

describe('ArtifactTile', () => {
	it('link e arquivo pintam miniaturas diferentes', () => {
		expect(artifactThumbVariants({ tone: 'link' })).toContain('bg-accent')
		expect(artifactThumbVariants({ tone: 'default' })).toContain('bg-card')
	})

	it('sem render é um div; com render vira o elemento dado', () => {
		const inert = renderToStaticMarkup(<ArtifactTile glyph="G" name="a.png" kind="Imagem" />)
		const link = renderToStaticMarkup(<ArtifactTile glyph="G" name="a.png" kind="Imagem" render={<a href="#a" />} />)
		expect(inert.startsWith('<div')).toBe(true)
		expect(link.startsWith('<a')).toBe(true)
		expect(link).toContain('href="#a"')
		expect(link).toContain('data-slot="artifact-tile"')
	})

	it('thumb substitui o glifo', () => {
		const html = renderToStaticMarkup(<ArtifactTile glyph="GLIFO" thumb={<img alt="prévia" src="x.png" />} name="a.png" kind="Imagem" />)
		expect(html).not.toContain('GLIFO')
		expect(html).toContain('<img')
	})
})

describe('ArtifactChip', () => {
	it('mostra o ícone de abrir por padrão e some com trailing={null}', () => {
		const withOpen = renderToStaticMarkup(<ArtifactChip glyph="G" name="Prévia" detail="link" />)
		const without = renderToStaticMarkup(<ArtifactChip glyph="G" name="Prévia" detail="link" trailing={null} />)
		expect(withOpen.match(/<svg/g)?.length).toBe(1)
		expect(without).not.toContain('<svg')
		expect(withOpen).toContain('data-slot="artifact-chip"')
	})
})

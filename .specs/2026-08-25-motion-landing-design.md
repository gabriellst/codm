# Motion — tokens de movimento e entradas na landing — design

**Status:** Approved (founder, 2026-08-25)
**Escopo:** `packages/app/ui/styles/{tokens,web-utilities}.css` (tokens + utilitários compartilhados) · `packages/app/astro` (landing). Console fora de escopo nesta rodada (primitivos mantêm `duration-150 ease-out`).

## Context

A landing tem só `rise-in` (0,5s `ease`), `pulse-dot` e view transitions; o design system não tem tokens de movimento (`--ease-*`, `--duration-*`), e cada animação nasce como CSS solto. `prefers-reduced-motion` já é respeitado em `global.css`. A lib `motion` foi removida por falta de uso — tudo aqui é CSS puro + um `IntersectionObserver` mínimo.

## Decisions

1. **Uma volta só, bem de leve.** A curva de entrada de cards/CTA é `ease-out-back` com overshoot ~3–4%: `cubic-bezier(0.34, 1.3, 0.64, 1)`. Sem elastic de múltiplas oscilações em lugar nenhum. Ease-**in** nunca em entrada (lê como lag); saídas (raras) usam `ease-in-quart`.
2. **Texto não oscila.** Títulos/parágrafos entram com `ease-out-quart` (`cubic-bezier(0.25, 1, 0.5, 1)`) — deslocamento `translateY(12px)→0` + opacidade, stagger por linha/bloco (não por letra).
3. **Tokens no design system, não na landing:** em `app-ui/styles/tokens.css`: `--ease-out-back`, `--ease-out-quart`, `--ease-in-quart`, `--duration-fast: 150ms`, `--duration-base: 320ms`, `--duration-slow: 560ms`, `--stagger: 60ms`. Nenhum valor de easing literal fora dos tokens (rail: grep de `cubic-bezier(` fora de tokens.css falha no lint de design).
4. **Utilitários compartilhados** em `web-utilities.css`: `reveal` (estado inicial `opacity:0; transform: translateY(12px)`; com `.is-inview`: repouso, `transition: opacity var(--duration-slow) var(--ease-out-quart), transform var(--duration-slow) var(--ease-out-quart)`), `reveal-back` (idem com `scale(.97)` e `--ease-out-back` — cards, CTA, badges, bolhas), `reveal-stagger` (`transition-delay: calc(var(--i, 0) * var(--stagger))`; o filho recebe `style="--i: n"`). Hover de card: `transition: transform var(--duration-fast) var(--ease-out-back)`, lift 3px.
5. **Disparo:** script inline na landing (`BaseLayout`), `IntersectionObserver` com `threshold: 0.15`, marca `.is-inview` uma vez e desobserva. O hero também ANIMA no carregamento (founder, 2026-08-25): nasce escondido e o observer — que dispara imediatamente para alvos já visíveis — marca `.is-inview` no primeiro frame, com o stagger badge → headline → subhead → CTA. Sem JS (ou com reduced-motion): tudo em repouso — `@media (prefers-reduced-motion: reduce) { .reveal, .reveal-back { opacity:1; transform:none; transition:none } }`.
6. **Só `transform` e `opacity`.** Nada de animar layout, cor de fundo em entrada, ou `filter`.
7. **Onde:** hero (headline → subhead → CTA, stagger), cards de features e de preço (back + stagger), bolhas do demo de conversa (back, stagger sequencial mais lento: `--stagger` ×2), stat/badges (back). Nav/footer não animam.
8. **Fidelity:** o alvo `screen-landing` é medido em repouso — o runner só captura depois de `.is-inview` aplicado e das transições terminadas (aguardar `transitionend` ou `duration-slow + stagger máximo`); o score não pode cair por captura no meio da animação.

## Acceptance Criteria

- AC-1 Tokens presentes em `tokens.css`; nenhum `cubic-bezier(` literal fora dele em `packages/app/{ui,astro,react}` (grep).
- AC-2 `reveal`/`reveal-back`/`reveal-stagger` definidos como `@utility` e usados na landing nos pontos da Decision 7.
- AC-3 Com JS desligado ou reduced-motion, a landing renderiza em repouso (nenhum elemento fica invisível).
- AC-4 `bun x nx run app-astro:build` verde; `bun fidelity` para `screen-landing` sem queda de score (captura em repouso).
- AC-5 Overshoot do back ≤ 4% (curva fixa: `0.34, 1.3, 0.64, 1`).

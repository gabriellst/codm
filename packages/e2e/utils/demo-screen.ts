import { join } from 'node:path'
import type { Browser } from '@playwright/test'
import type { Locale } from './i18n'

/**
 * THE SCREEN THE SCRIPTED AGENT "BUILT" — rendered here, by Playwright, into the run's workspace.
 *
 * The demo roteiro's work act declares an IMAGE artifact at a WORKSPACE-relative path
 * (`agent/services/AgentScenario/scenarios.ts`, `DEMO_SCREEN_FILE`). Something has to actually put
 * bytes there before the turn runs, and this is it.
 *
 * ### Why it is drawn rather than committed
 * Same rule `writeSampleWav`/`writeSampleFile` follow next door: every byte is synthesized. The
 * console renders an IMAGE artifact through a real `<img>` and falls back to a plain file row when the
 * browser cannot decode it — so a placeholder blob would put the FALLBACK on film. A real screenshot
 * taken by the same engine that will render it cannot have that problem, and it costs no committed
 * binary and no external tool (there is no ffmpeg, and no design export, on the build host).
 *
 * ### Why it looks like somebody else's app, and why the colours are literals
 * It is the agent's OUTPUT, not the product. `acme/web` is invented, and so is everything on the page:
 * no real company, no real customer, no real price. Same rule the film's copy follows everywhere else.
 *
 * So the design-token rule (`bp-06`) does not apply and must not be applied: this markup is rendered
 * by `setContent` into a blank page that has no stylesheet of ours loaded, and dressing it in the
 * console's own tokens would make the agent's deliverable look like the console — which is the one
 * thing this image must NOT look like. It is a prop, deliberately outside the design system.
 */
/** Every word on the prop, per language. The layout is shared; only the strings differ. */
const SCREEN_COPY = {
	pt: {
		crumb: 'Configurações · Cobrança',
		title: 'Cobrança',
		nextInvoice: 'Próxima fatura em 12 dias',
		planEyebrow: 'Resumo do plano',
		planName: 'Equipe',
		planBadge: 'Ativo',
		seats: ['Assentos', '8 de 10 usados'],
		cycle: ['Ciclo', 'Mensal · renova em 12 dias'],
		previews: ['Ambientes de prévia', 'Ilimitados'],
		total: ['Total mensal', 'R$ 1.240,00'],
		methodEyebrow: 'Forma de pagamento',
		card: 'Termina em 4242 · 09/29',
		invoicesEyebrow: 'Faturas',
		invoices: 'Últimas 12 disponíveis para download',
		cta: 'Gerenciar assinatura',
	},
	en: {
		crumb: 'Settings · Billing',
		title: 'Billing',
		nextInvoice: 'Next invoice in 12 days',
		planEyebrow: 'Plan summary',
		planName: 'Team',
		planBadge: 'Active',
		seats: ['Seats', '8 of 10 used'],
		cycle: ['Cycle', 'Monthly · renews in 12 days'],
		previews: ['Preview environments', 'Unlimited'],
		total: ['Monthly total', '$1,240.00'],
		methodEyebrow: 'Payment method',
		card: 'Ends in 4242 · 09/29',
		invoicesEyebrow: 'Invoices',
		invoices: 'Last 12 available to download',
		cta: 'Manage subscription',
	},
} as const satisfies Record<Locale, unknown>

const screenHtml = (copy: (typeof SCREEN_COPY)[Locale]) => `
<!doctype html>
<meta charset="utf-8">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 960px; height: 600px; background: #f6f7f9; padding: 40px;
    font: 15px/1.5 ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif; color: #16181d;
    display: flex; flex-direction: column; gap: 28px;
  }
  header { display: flex; align-items: baseline; justify-content: space-between; }
  h1 { font-size: 26px; letter-spacing: -0.02em; }
  .crumb { color: #6b7280; font-size: 13px; }
  .cards { display: grid; grid-template-columns: 1.35fr 1fr; gap: 20px; flex: 1; }
  .card { background: #fff; border: 1px solid #e6e8ec; border-radius: 16px; padding: 24px; }
  .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: #6b7280; }
  /* The component the scripted run says it created — the reason this screenshot exists at all. */
  .plan { display: flex; align-items: baseline; gap: 10px; margin-top: 14px; }
  .plan strong { font-size: 30px; letter-spacing: -0.02em; }
  .badge { background: #e8f4ec; color: #1c6b3f; border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 600; }
  ul { list-style: none; margin-top: 20px; display: flex; flex-direction: column; gap: 12px; }
  li { display: flex; justify-content: space-between; border-top: 1px solid #f0f1f4; padding-top: 12px; font-size: 14px; }
  li span:last-child { color: #6b7280; }
  .total { margin-top: auto; display: flex; justify-content: space-between; align-items: baseline;
           border-top: 2px solid #16181d; padding-top: 14px; font-weight: 700; }
  .side { display: flex; flex-direction: column; gap: 14px; }
  .method { display: flex; align-items: center; gap: 12px; font-size: 14px; }
  .chip { width: 42px; height: 28px; border-radius: 6px; background: #16181d; color: #fff;
          font-size: 10px; font-weight: 700; display: grid; place-items: center; letter-spacing: 0.06em; }
  button { margin-top: auto; border: 0; border-radius: 10px; background: #16181d; color: #fff;
           padding: 12px 18px; font-size: 14px; font-weight: 600; }
</style>
<header>
  <div>
    <div class="crumb">${copy.crumb}</div>
    <h1>${copy.title}</h1>
  </div>
  <div class="crumb">${copy.nextInvoice}</div>
</header>
<div class="cards">
  <section class="card" style="display:flex;flex-direction:column">
    <div class="eyebrow">${copy.planEyebrow}</div>
    <div class="plan"><strong>${copy.planName}</strong><span class="badge">${copy.planBadge}</span></div>
    <ul>
      <li><span>${copy.seats[0]}</span><span>${copy.seats[1]}</span></li>
      <li><span>${copy.cycle[0]}</span><span>${copy.cycle[1]}</span></li>
      <li><span>${copy.previews[0]}</span><span>${copy.previews[1]}</span></li>
    </ul>
    <div class="total"><span>${copy.total[0]}</span><span>${copy.total[1]}</span></div>
  </section>
  <section class="card side">
    <div class="eyebrow">${copy.methodEyebrow}</div>
    <div class="method"><span class="chip">CARD</span><span>${copy.card}</span></div>
    <div class="eyebrow" style="margin-top:8px">${copy.invoicesEyebrow}</div>
    <div style="font-size:14px;color:#6b7280">${copy.invoices}</div>
    <button>${copy.cta}</button>
  </section>
</div>
`

/**
 * Draw the screen and write it into `workspacePath` under `fileName`.
 *
 * Its OWN browser context, deliberately: the film's page is mid-take with an animated cursor overlay
 * and a DOM recorder attached to it, and neither survives being navigated to a data URL and back.
 */
export async function writeBuiltScreen(browser: Browser, workspacePath: string, fileName: string, locale: Locale): Promise<string> {
	const context = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 2 })
	try {
		const page = await context.newPage()
		await page.setContent(screenHtml(SCREEN_COPY[locale]), { waitUntil: 'load' })
		const path = join(workspacePath, fileName)
		await page.screenshot({ path })
		return path
	} finally {
		await context.close()
	}
}

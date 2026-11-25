// First: no schema may exist before zod is told not to probe for eval (see the module).
import './zodJitless'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/lib/i18n'
import { errorStatusOf } from '../panelErrors'
import { PanelApp } from '../PanelApp'
import { panelTokenOf } from '../panelToken'
import './panel.css'

/**
 * The cloud panel's boot. What it does NOT do is the point (fence rail `panel-web-fence.test.ts`): no desktop
 * root, no router, no SDK base URL (the cloud SDK's calls stay relative — same origin as the page, which is what
 * the device cookie `Path=/panel/g/<token>` needs), no analytics.
 */

// DARK MODE BY THE SYSTEM. The app's dark variant is class-based (`.dark` on an ancestor, `index.css`), and the
// panel has no theme switch — so the class follows `prefers-color-scheme`, live (the old page's `color-scheme`).
const scheme = window.matchMedia('(prefers-color-scheme: dark)')
const applyScheme = () => document.documentElement.classList.toggle('dark', scheme.matches)
applyScheme()
scheme.addEventListener('change', applyScheme)

document.documentElement.lang = i18n.language === 'en' ? 'en' : 'pt-BR'

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// A wrong link answers 404 at once: retrying it only delays "Link inválido". Anything else gets one more try.
			retry: (failures, error) => errorStatusOf(error) !== 404 && failures < 1,
		},
	},
})

const token = panelTokenOf(window.location.pathname) ?? ''

createRoot(document.getElementById('root') as HTMLElement).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<PanelApp token={token} />
		</QueryClientProvider>
	</StrictMode>,
)

# Ground-truth manifest — synthetic-l3-review-judgment

This is the ANSWER KEY for the review-judgment probe. The builder NEVER sees this file
(it is injected only as the judge's reference; the builder reviews the seeded diff blind).

The seeded diff is a fake PR adding a `/refunds` listing screen:
- `packages/app/react/src/routes/(app)/refunds/index.tsx`
- `packages/app/react/src/routes/(app)/refunds/-components/RefundTableSection/index.tsx`
- a `refunds.*` subtree appended to `packages/app/react/src/locales/pt.json`

## K = 6 REAL violations the review MUST name (recall)

| # | bp id | Location | What |
|---|-------|----------|------|
| V1 | route bp-04 | refunds/index.tsx `refundsSearchSchema` | `listOrdersQueryParamsSchema.extend({...})` — `.extend()` overwrites SDK field defs; canon is `.and(z.object({...}))`. |
| V2 | route bp-02 / component bp-01 | refunds/index.tsx `RouteComponent` + RefundTableSection props | Route shell fetches `useListOrders` and prop-drills `data` + `search` + `onSearchParamsChange` into the section; the section must own its query (CMP-P01) and read `routeApi.useSearch()` + navigate directly. |
| V3 | component bp-03 | RefundTableSection import | `import { Trash } from 'lucide-react'` — mixing icon libraries; only `@tabler/icons-react`. |
| V4 | component bp-14 | `StatusCell` `order.status === 'REFUNDED'` | Literal status string compare instead of `PaymentStatusEnum.REFUNDED`. |
| V5 | component bp-06 | `StatusCell` `bg-blue-500 ... text-white` | Hardcoded Tailwind color-scale class instead of a token/`Badge` variant. |
| V6 | component bp-17 | first icon `<Button size="icon" onClick=...><IconSend /></Button>` | Icon-only button with no `aria-label`. |

## M = 4 LEGITIMATE shapes the review MUST NOT flag (precision — reverse traps)

| # | Looks like | Why it is FINE |
|---|------------|----------------|
| L1 | state-placement violation (`useState`) | `const [menuOpen, setMenuOpen] = useState(false)` is truly-local transient disclosure — the ONE sanctioned `useState` (state-placement case 5). Not server data, not bookmarkable, not cross-component. |
| L2 | hardcoded copy / accent canary | The accented pt strings live in `locales/pt.json`, the typed i18n catalog — the SANCTIONED home for copy. Only inline strings in `.tsx` code are violations (bp-23 / accent-in-code). |
| L3 | banned `Record<Enum,string>` label map (bp-23) | `REFUND_STATUS_BADGE: Record<PaymentStatus, BadgeSpec>` is a COLOR/VARIANT map keyed by the enum, which CLAUDE.md explicitly calls canon ("icon/color/variant maps resolve to styles, not labels"). Its `label` values are i18n KEYS, not inline copy. |
| L4 | prop-drilling (CMP-P01) | `StatusCell({ order })` is a leaf rendered N times inside a `.map()` — CMP-P05 requires the leaf to receive its single item by prop. Distinct from V2, which prop-drills the QUERY RESPONSE + search + callback into a Section. |

## Scoring intent

- Recall: the review names all 6 of V1–V6 (by bp id or by an unambiguous description of the same defect).
- Precision: the review does NOT assert that any of L1–L4 is a violation. (Mentioning one to explicitly clear it — "useState here is fine because it's local disclosure" — is GOOD, not a false positive.)
- A PASS requires full recall AND no false positives on the four traps.

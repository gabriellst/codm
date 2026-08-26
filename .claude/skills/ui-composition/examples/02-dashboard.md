# Example 02 — Dashboard (Overview + Appointments Master/Detail)

> Worked output for `routes/(app)/dashboard/` on `dev`. Shows: multi-Section vertical stack, master/detail via URL `selectedAppointmentId`, shared `CalendarWidget`, shared `CreateAppointmentDialog`.

**Source screen:** `packages/app/react/src/routes/(app)/dashboard/index.tsx` and `-components/`

---

## UI Composition

### URL Contract

- **Path:** `/(app)/dashboard/`
- **Breadcrumb:** `nav.dashboard`
- **Search params (Zod sketch):**
  - `view` — `z.enum(CalendarView).optional().default(CalendarView.WEEK)` — calendar granularity
  - `startDate` — `z.coerce.date().optional().default(() => startOfWeek(new Date()))` — range start
  - `endDate` — `z.coerce.date().optional().default(() => endOfWeek(new Date()))` — range end
  - `selectedAppointmentId` — `z.string().optional()` — drives the AppointmentDetails panel
  - `isCalendarModalOpen` — `z.boolean().optional()` — full-screen calendar overlay flag
- **Loader:** none
- **errorComponent:** `RouteError`

### ASCII Layout Map

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Route Shell — Dashboard (no header text, sections render their own H2)     │
├────────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ OverviewSection                                                         │ │
│ │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐           │ │
│ │  │ StatCard×4 │ │ StatCard×4 │ │ StatCard×4 │ │ StatCard×4 │           │ │
│ │  └────────────┘ └────────────┘ └────────────┘ └────────────┘           │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ AppointmentsSection                                                     │ │
│ │  ┌──────────────────────────────┐ ┌────────────────────────────────┐  │ │
│ │  │ CalendarWidget (shared)       │ │ AppointmentDetails (shared)     │  │ │
│ │  │  ┌────────────────────────┐  │ │                                  │  │ │
│ │  │  │ CalendarHeader          │  │ │ (renders the appointment for    │  │ │
│ │  │  │ ViewSelector            │  │ │  selectedAppointmentId)         │  │ │
│ │  │  │ Timeline / WeekTimeline │  │ │                                  │  │ │
│ │  │  │ / MonthGrid             │  │ │                                  │  │ │
│ │  │  │  AppointmentCard ×N     │  │ │                                  │  │ │
│ │  │  └────────────────────────┘  │ │                                  │  │ │
│ │  └──────────────────────────────┘ └────────────────────────────────┘  │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ AgentSection                                                            │ │
│ │  status pill + agent KPI tiles + actions                                │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ BottomSection                                                           │ │
│ │  charts + audit log table                                               │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘

Overlays:
  CreateAppointmentDialog (Dialog, shared) — opens on click of "+ Nova" inside AppointmentsSection
```

### Component Tree

```text
DashboardRoute                                             (Route Shell)
├─ OverviewSection                                         (Section, KPI grid)
│  └─ StatCard                                             (Leaf ×4 — shared component)
├─ AppointmentsSection                                     (Section, master/detail)
│  ├─ CalendarWidget                                       (shared component, master)
│  │  ├─ CalendarHeader                                    (Component)
│  │  ├─ ViewSelector                                      (Component, writes URL `view`)
│  │  ├─ Timeline | WeekTimeline | MonthGrid               (Component, switched by view)
│  │  └─ AppointmentCard                                   (Leaf ×N)
│  └─ AppointmentDetails                                   (shared component, detail panel)
├─ AgentSection                                            (Section, agent status + KPIs)
└─ BottomSection                                           (Section, charts + audit)

Overlays:
└─ CreateAppointmentDialog                                 (Dialog, shared)
```

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| DashboardRoute | RouteShell | — | declares: `view, startDate, endDate, selectedAppointmentId, isCalendarModalOpen` | — | — | create-route-local | `routes/(app)/dashboard/index.tsx` | /route |
| OverviewSection | Section | `useGetDashboard({ startDate, endDate }).overview` (slice of composite query) | reads: `startDate, endDate` | — | — | create-route-local | `routes/(app)/dashboard/-components/OverviewSection/` | /component |
| StatCard | Leaf | props from OverviewSection | — | — | — | reuse — `@/components/StatCard/` (from Example 01) | `@/components/StatCard/` | (already exists once Example 01 ships) |
| AppointmentsSection | Section | `useGetDashboard({ startDate, endDate }).calendarAppointments` + uses `useRangeSearchParams` | reads: `view, startDate, endDate, selectedAppointmentId`; writes: `view, startDate, endDate, selectedAppointmentId` | — | — | create-route-local | `routes/(app)/dashboard/-components/AppointmentsSection/` | /component |
| CalendarWidget | shared Component | props `{ appointments, view, range, onSelect, onRangeChange }` from AppointmentsSection | — | — | — | reuse — `@/components/CalendarWidget/` | `@/components/CalendarWidget/index.tsx` | (already exists) |
| AppointmentCard | Leaf | props from CalendarWidget's internal map | — | — | — | reuse — internal to CalendarWidget | `@/components/CalendarWidget/AppointmentCard/` | (already exists) |
| AppointmentDetails | shared Component | props `{ appointment }` from AppointmentsSection (resolved by selectedAppointmentId) | — | — | — | reuse — `@/components/CalendarWidget/AppointmentDetails/` | `@/components/CalendarWidget/AppointmentDetails/index.tsx` | (already exists) |
| AgentSection | Section | `useGetDashboard().agentMetrics` + `useGetAgent()` | — | — | — | create-route-local | `routes/(app)/dashboard/-components/AgentSection/` | /component |
| BottomSection | Section | `useGetDashboard().{appointmentsByStatusChart, appointmentsPerMonth, auditLog}` | — | — | — | create-route-local | `routes/(app)/dashboard/-components/BottomSection/` | /component |
| CreateAppointmentDialog | Dialog | — | — | `useDialogStore` | — | reuse — `@/components/Dialogs/CreateAppointmentDialog/` | `@/components/Dialogs/CreateAppointmentDialog/index.tsx` | (already exists) |

**Per-node notes:**

- **AppointmentsSection** — Renders `CalendarWidget` left (col-span 7) and `AppointmentDetails` right (col-span 5) on `lg:` breakpoint. Owns the `+ Nova` action that calls `useDialogStore.show(<CreateAppointmentDialog />)`. Skeleton: `CalendarWidgetSkeleton` + `AppointmentDetailsSkeleton` (already implemented). ARIA: `role="region" aria-label="Agenda"`.
- **CalendarWidget** — Currently duplicated as `routes/(app)/dashboard/-components/AppointmentsSection/CalendarWidget/`. **Action item:** refactor to use shared `@/components/CalendarWidget/` only; delete the dupe. This is a `reuse` decision conditional on completing the de-dup refactor.
- **ViewSelector** — writes URL `view`; internal to `CalendarWidget`'s props contract (the consumer decides whether to drive `view` from URL or local state). Dashboard wires it to URL.
- **AppointmentDetails** — Renders `Empty` primitive when `selectedAppointmentId` is undefined (placeholder "Selecione um agendamento").

### Reuse Summary

- **Reuse (no work):**
  - `CalendarWidget`, `AppointmentDetails`, `CalendarHeader`, `ViewSelector`, `Timeline`, `WeekTimeline`, `MonthGrid`, `AppointmentCard`, `CurrentTimeIndicator` — all under `@/components/CalendarWidget/`
  - `CreateAppointmentDialog` — `@/components/Dialogs/CreateAppointmentDialog/`
  - `StatCard` — `@/components/StatCard/` (assuming Example 01's promotion happened first)
- **Promote to shared:** (none new)
- **Create new shared:** (none — relies on Example 01's StatCard)
- **Create route-local:**
  - `OverviewSection`, `AppointmentsSection`, `AgentSection`, `BottomSection` — domain coupled to dashboard read DTO.
- **De-dup refactor required:**
  - Delete duplicated `routes/(app)/dashboard/-components/AppointmentsSection/CalendarWidget/` subtree; consume `@/components/CalendarWidget/` directly.

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | /route | DashboardRoute | `routes/(app)/dashboard/index.tsx` | search schema composes SDK + frontend selection params |
| 2 | (refactor) | de-dup CalendarWidget | delete `dashboard/-components/AppointmentsSection/CalendarWidget/` | use `@/components/CalendarWidget/` directly |
| 3 | /component | OverviewSection | `routes/(app)/dashboard/-components/OverviewSection/` | renders 4 StatCards |
| 4 | /component | AppointmentsSection | `routes/(app)/dashboard/-components/AppointmentsSection/` | owns range + selectedId in URL; opens CreateAppointmentDialog |
| 5 | /component | AgentSection | `routes/(app)/dashboard/-components/AgentSection/` | |
| 6 | /component | BottomSection | `routes/(app)/dashboard/-components/BottomSection/` | charts + audit |
| 7 | (reuse) | CalendarWidget | `@/components/CalendarWidget/` | already exists |
| 8 | (reuse) | StatCard | `@/components/StatCard/` | from Example 01 |
| 9 | (reuse) | CreateAppointmentDialog | `@/components/Dialogs/CreateAppointmentDialog/` | already exists |

### Open Questions

- OQ-1. `BottomSection` aggregates 3 visualizations (status chart + monthly chart + audit log). It currently orchestrates these via a single Section. Should this be split into `StatusChartSection`, `MonthlyChartSection`, `AuditLogSection` (3 Sections side-by-side) when charts grow more independent? **Proposed:** keep single Section while all 3 read from the same composite `useGetDashboard()` query; split when any one needs its own pagination/range.

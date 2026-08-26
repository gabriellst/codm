# Example 01 — Patients List Page

> Worked output of the `ui-composition` skill against the `routes/(app)/patients/` screen on `dev`. Shows a list page pattern: header static UI, KPI Section, list Section with Leaf + pagination, action button that opens a shared Dialog.

**Source screen:** `packages/app/react/src/routes/(app)/patients/index.tsx` and `-components/`

---

## UI Composition

### URL Contract

- **Path:** `/(app)/patients/`
- **Breadcrumb:** `nav.patients`
- **Search params (Zod sketch):**
  - `page` — `z.number().optional().default(1)` — pagination
  - `limit` — `z.number().optional().default(10)` — page size
  - `search` — `z.string().optional()` — free-text search
  - `selectedServiceId` — `z.string().optional()` — filter by service
- **Loader:** none
- **errorComponent:** `RouteError`

### ASCII Layout Map

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Route Shell — title "Pacientes" + subtitle                           │
├──────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ StatsSection                                                      │ │
│ │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐    │ │
│ │  │ StatCard×4 │ │ StatCard×4 │ │ StatCard×4 │ │ StatCard×4 │    │ │
│ │  └────────────┘ └────────────┘ └────────────┘ └────────────┘    │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ PatientListSection                                                │ │
│ │  ┌──────────────────────────────────────────────────────────┐    │ │
│ │  │ SearchRow                                                 │    │ │
│ │  └──────────────────────────────────────────────────────────┘    │ │
│ │  ┌──────────────────────────────────────────────────────────┐    │ │
│ │  │ PatientRow (Leaf ×N)                                      │    │ │
│ │  └──────────────────────────────────────────────────────────┘    │ │
│ │  ┌──────────────────────────────────────────────────────────┐    │ │
│ │  │ Pagination                                                │    │ │
│ │  └──────────────────────────────────────────────────────────┘    │ │
│ └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘

Overlays:
  CreatePatientDialog (Dialog, shared) — opens on click of "+ Novo Paciente" inside SearchRow
```

### Component Tree

```text
PatientsRoute                                              (Route Shell)
├─ <h1>Pacientes</h1> + subtitle                          (static UI in Route Shell)
├─ StatsSection                                           (Section, owns stats query)
│  └─ StatCard                                            (Leaf ×4)
└─ PatientListSection                                     (Section, owns list query)
   ├─ SearchRow                                           (Component, URL writer + opens Dialog)
   ├─ PatientRow                                          (Leaf ×N)
   └─ Pagination                                          (Component, URL writer)

Overlays:
└─ CreatePatientDialog                                    (Dialog, shared)
```

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| PatientsRoute | RouteShell | — | declares: `page, limit, search, selectedServiceId` | — | — | create-route-local | `routes/(app)/patients/index.tsx` | /route |
| StatsSection | Section | `useGetPatientStats()` (or extracted from useListPatients response) | — | — | — | create-route-local | `routes/(app)/patients/-components/StatsSection/` | /component |
| StatCard | Leaf | props from StatsSection | — | — | — | create-new-shared (canonical KPI card; reusable across dashboard/patients/collaborators) | `@/components/StatCard/` | /component |
| PatientListSection | Section | `useListPatients({ page, limit, search, selectedServiceId })` | reads: `page, limit, search, selectedServiceId` | — | — | create-route-local | `routes/(app)/patients/-components/PatientListSection/` | /component |
| SearchRow | Component | — | writes: `search, page=1`; reads: `search` | — | `[inputValue]` (via `useDebouncedSearch`) | create-route-local | `routes/(app)/patients/-components/PatientListSection/SearchRow/` | /component |
| PatientRow | Leaf | props from PatientListSection | — | — | — | create-route-local | `routes/(app)/patients/-components/PatientListSection/PatientRow/` | /component |
| Pagination | Component | — | reads: `page, limit`; writes: `page` | — | — | reuse — `@codm/app-ui/pagination` | `@codm/app-ui/pagination` | (primitive — already exists) |
| CreatePatientDialog | Dialog | — | — | `useDialogStore` (writes hide on success) | — | reuse — `@/components/Dialogs/CreatePatientDialog/` | `@/components/Dialogs/CreatePatientDialog/index.tsx` | (already exists) |

**Per-node notes:**

- **StatsSection** — Skeleton: 4 card placeholders with rounded corners. Empty: never (always 4 cards even at 0). ARIA: `role="region" aria-label="Resumo de pacientes"`. Rationale: stats are aggregate of list query response; could be its own query if backend supports.
- **StatCard** — ARIA: each card has `aria-label="<Stat label>: <value>"`. Rationale: shape `{ label, value, trend?, icon? }` is identical across dashboard's KPI section and collaborators/StatsSection; promote opportunity.
- **PatientListSection** — Skeleton: 6 row placeholders. Empty: `<Empty>` primitive with message "Nenhum paciente encontrado". ARIA: `role="list" aria-label="Lista de pacientes"`. Rationale: domain coupled.
- **SearchRow** — Contains the search input AND the "+ Novo Paciente" action button. Owns `useDebouncedSearch` (300ms). On button click: `useDialogStore.show(<CreatePatientDialog />)`. ARIA: search input has `aria-label="Buscar pacientes"`.

### Reuse Summary

- **Reuse (no work):**
  - `Pagination` — `@codm/app-ui/pagination` (primitive)
  - `CreatePatientDialog` — `@/components/Dialogs/CreatePatientDialog/` (already used by dashboard's AppointmentsSection too)
- **Promote to shared:** (none in this screen)
- **Create new shared:**
  - `StatCard` → `@/components/StatCard/` — anticipated consumers: dashboard KPIs, collaborators StatsSection, patients StatsSection. Props `{ label, value, trend?, icon? }` are domain-free.
- **Create route-local:**
  - `StatsSection`, `PatientListSection`, `SearchRow`, `PatientRow` — domain coupled (patient).

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | /route | PatientsRoute | `routes/(app)/patients/index.tsx` | search schema composed from SDK |
| 2 | /component (shared) | StatCard | `@/components/StatCard/` | NEW — generic `{ label, value, trend?, icon? }`; refactor dashboard + collaborators afterwards |
| 3 | /component | StatsSection | `routes/(app)/patients/-components/StatsSection/` | uses StatCard ×4 |
| 4 | /component | PatientListSection | `routes/(app)/patients/-components/PatientListSection/` | owns `useListPatients`, renders inline skeleton |
| 5 | /component | SearchRow | `routes/(app)/patients/-components/PatientListSection/SearchRow/` | uses `useDebouncedSearch`; `useDialogStore.show()` for "+ Novo Paciente" |
| 6 | /component | PatientRow | `routes/(app)/patients/-components/PatientListSection/PatientRow/` | Leaf; receives `patient` via props |
| 7 | (reuse) | Pagination | `@codm/app-ui/pagination` | already exists |
| 8 | (reuse) | CreatePatientDialog | `@/components/Dialogs/CreatePatientDialog/` | already exists |

### Open Questions

(none for this screen)

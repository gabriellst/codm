---
name: store
description: Create a Zustand store for state management. Use when you need interactive client-side state that persists between components within a session. Use this skill for modal state, UI toggles, selection state, or any client-side state shared across components. For persistence across page refreshes, use the persist middleware pattern.
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

# Create Zustand Store

Creates a Zustand store for managing interactive state following project patterns.

## Platform applicability

This skill is **single-flavor**: the same Zustand patterns work identically in `packages/app/react/` and `packages/app/expo/`. Same import (`import { create } from 'zustand'`), same `persist` middleware shape, same selector ergonomics. The only difference is where the store file lives — `packages/app/react/src/stores/` or `packages/app/expo/lib/stores/` (or a route's `-stores/` folder for route-private state).

**Not applicable to `packages/app/astro/`.** Astro is render-time; if you find yourself needing a Zustand store on an astro page, the work probably belongs in the react app — link out to `/app/...` instead of replicating interactive state on the landing page.

## Prerequisites

- Read `docs/FRONTEND.md` for state management rules
- Understand when to use stores vs URL state

## When to Use Stores

| State Type | Solution | Example |
|------------|----------|---------|
| **URL/Shareable** | Search Params | Filters, pagination, sorting |
| **Interactive** | Zustand Store | Form state, UI state, selections |
| **Local** | Props | Component-specific data |

Use Zustand stores when:
- State needs to persist across component mounts
- State is shared between multiple components
- State shouldn't be in the URL (e.g., modal open state)

**Don't** use stores for:
- Filter/search/pagination state (use URL)
- Data that should be shareable via link (use URL)

## When NOT to Use Stores

- **Server/API state** — use TanStack Query
- **URL state** — use route search params (`Route.useSearch()`)
- **Form state** — use TanStack Form
- **Single-component state** — use `useState`/`useReducer`

## Store Types [STR-P05]

| Type | Location | Scope |
|------|----------|-------|
| **Global** | `packages/app/react/src/stores/` | Entire app |
| **Route** | `routes/[route]/-stores/` | Single route |

> **Account-level modes belong in a Global store, not the URL.** A mode shared by every screen and
> fed to many SDK reads — e.g. `viewScope: SINGLE | MULTI` (mono vs consolidated account view), selected org, role view —
> is global Zustand state under `src/stores/` (persisted), exported from `src/stores/index.ts`. URL
> search params are for *per-route, bookmarkable* filters only (date range, page, productIds). A
> dashboard-scoped display preference (e.g. "discount additional costs") that several cards on one
> route read is a **Route** store (`-stores/`).

## Process

### Step 1: Create Store File

**Global Store:**
```typescript
// packages/app/react/src/stores/useAuthStore.ts
import { create } from 'zustand'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
}

interface AuthActions {
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  logout: () => void
}

type AuthStore = AuthState & AuthActions

export const useAuthStore = create<AuthStore>((set) => ({
  // State
  user: null,
  token: null,
  isAuthenticated: false,

  // Actions
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setToken: (token) => set({ token }),
  logout: () => set({ user: null, token: null, isAuthenticated: false }),
}))
```

**Route Store:**
```typescript
// packages/app/react/src/routes/products/-stores/useProductsStore.ts
import { create } from 'zustand'

interface ProductsState {
  selectedIds: string[]
  isDeleteModalOpen: boolean
  viewMode: 'grid' | 'list'
}

interface ProductsActions {
  toggleSelection: (id: string) => void
  selectAll: (ids: string[]) => void
  clearSelection: () => void
  setDeleteModalOpen: (open: boolean) => void
  setViewMode: (mode: 'grid' | 'list') => void
}

type ProductsStore = ProductsState & ProductsActions

export const useProductsStore = create<ProductsStore>((set) => ({
  // State
  selectedIds: [],
  isDeleteModalOpen: false,
  viewMode: 'grid',

  // Actions
  toggleSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((i) => i !== id)
        : [...state.selectedIds, id],
    })),

  selectAll: (ids) => set({ selectedIds: ids }),
  clearSelection: () => set({ selectedIds: [] }),
  setDeleteModalOpen: (open) => set({ isDeleteModalOpen: open }),
  setViewMode: (mode) => set({ viewMode: mode }),
}))
```

### Step 2: Use in Components

```typescript
import { useProductsStore } from '../-stores/useProductsStore'

function ProductsToolbar() {
  const { selectedIds, clearSelection, setDeleteModalOpen, viewMode, setViewMode } =
    useProductsStore()

  return (
    <div className="flex gap-2">
      <span>{selectedIds.length} selected</span>

      {selectedIds.length > 0 && (
        <>
          <Button onClick={() => setDeleteModalOpen(true)}>Delete Selected</Button>
          <Button variant="outline" onClick={clearSelection}>Clear</Button>
        </>
      )}

      <div className="ml-auto">
        <Button
          variant={viewMode === 'grid' ? 'default' : 'outline'}
          onClick={() => setViewMode('grid')}
        >
          Grid
        </Button>
        <Button
          variant={viewMode === 'list' ? 'default' : 'outline'}
          onClick={() => setViewMode('list')}
        >
          List
        </Button>
      </div>
    </div>
  )
}
```

## Store Patterns [STR-C01, STR-C02, STR-C03, STR-P01, STR-P02, STR-P03]

### With Computed Values

```typescript
import { create } from 'zustand'

interface CartStore {
  items: CartItem[]
  addItem: (item: CartItem) => void
  removeItem: (id: string) => void
  // Computed (not stored, derived on access)
}

export const useCartStore = create<CartStore>((set) => ({
  items: [],
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
  removeItem: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
}))

// Computed selectors (outside store)
export const selectCartTotal = (state: CartStore) =>
  state.items.reduce((sum, item) => sum + item.price * item.quantity, 0)

export const selectCartItemCount = (state: CartStore) =>
  state.items.reduce((sum, item) => sum + item.quantity, 0)

// Usage
function CartSummary() {
  const total = useCartStore(selectCartTotal)
  const itemCount = useCartStore(selectCartItemCount)
  // ...
}
```

### With Persistence

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: 'light',
      language: 'en',
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'settings-storage', // localStorage key
    }
  )
)
```

### `partialize` — Restrict Persisted State

Use `partialize` to control which fields are persisted to localStorage. Only the returned fields are stored; the rest are ephemeral:

```typescript
export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      collapsed: false,
      hovering: false,
      setCollapsed: (collapsed) => set({ collapsed }),
      setHovering: (hovering) => set({ hovering }),
    }),
    {
      name: 'sidebar-storage',
      partialize: s => ({ collapsed: s.collapsed }), // only persist collapsed state
    }
  )
)
```

### With Immer (Complex Updates)

```typescript
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export const useTasksStore = create<TasksStore>()(
  immer((set) => ({
    tasks: [],
    updateTask: (id, updates) =>
      set((state) => {
        const task = state.tasks.find((t) => t.id === id)
        if (task) {
          Object.assign(task, updates) // Direct mutation with Immer
        }
      }),
  }))
)
```

## Selective Subscriptions [STR-C02, bp-04]

Only re-render when specific state changes:

See `STR-C02` in registry.yaml for the wrong/right pattern.

## Critical Rules [bp-01, bp-02, bp-03]

### Don't Store Server Data

See `bp-03` in registry.yaml for the wrong/right pattern.

### Don't Duplicate URL State

See `bp-01` and `bp-02` in registry.yaml for the wrong/right patterns.

### Reset Store When Needed

```typescript
const initialState = {
  selectedIds: [],
  isModalOpen: false,
}

export const useProductsStore = create<ProductsStore>((set) => ({
  ...initialState,
  // Actions...
  reset: () => set(initialState),
}))

// Usage - reset on unmount
useEffect(() => {
  return () => useProductsStore.getState().reset()
}, [])
```

## Checklist

- [ ] All `when: always` patterns present (STR-01 through STR-03 — verify against registry.yaml)
- [ ] Each conditional pattern evaluated (STR-C01 through STR-C03 — check which apply)
- [ ] No `bad_practices` violations (bp-01 through bp-04 — verify against registry.yaml)

## Example

Creating a shopping cart store:

```typescript
// packages/app/react/src/stores/useCartStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface CartItem {
  id: string
  productId: string
  name: string
  price: number
  quantity: number
}

interface CartState {
  items: CartItem[]
  isOpen: boolean
}

interface CartActions {
  addItem: (item: Omit<CartItem, 'id'>) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  clearCart: () => void
  setOpen: (open: boolean) => void
}

type CartStore = CartState & CartActions

export const useCartStore = create<CartStore>()(
  persist(
    (set) => ({
      items: [],
      isOpen: false,

      addItem: (item) =>
        set((state) => {
          const existing = state.items.find((i) => i.productId === item.productId)
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === item.productId
                  ? { ...i, quantity: i.quantity + item.quantity }
                  : i
              ),
            }
          }
          return {
            items: [...state.items, { ...item, id: crypto.randomUUID() }],
          }
        }),

      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        })),

      updateQuantity: (id, quantity) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, quantity: Math.max(0, quantity) } : i
          ).filter((i) => i.quantity > 0),
        })),

      clearCart: () => set({ items: [] }),
      setOpen: (open) => set({ isOpen: open }),
    }),
    {
      name: 'cart-storage',
    }
  )
)

// Selectors
export const selectCartTotal = (state: CartStore) =>
  state.items.reduce((sum, item) => sum + item.price * item.quantity, 0)

export const selectCartItemCount = (state: CartStore) =>
  state.items.reduce((sum, item) => sum + item.quantity, 0)
```

## References

- `docs/FRONTEND.md` — "State Management Strategy" section (decision framework for URL vs Zustand vs Dialog store vs `useState`)

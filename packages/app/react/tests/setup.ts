import { GlobalRegistrator } from '@happy-dom/global-registrator'

/**
 * A DOM for the console's tests, registered as a bun PRELOAD (see `bunfig.toml`) so it exists before
 * any module — React's included — is evaluated.
 *
 * Why a DOM at all, when four of the five existing suites are happy without one: the console's
 * real-time layer is not a pure function. `useServerEventSource` re-dispatches every SSE frame as a
 * `document` CustomEvent and `useServerEvents` subscribes with `document.addEventListener`, so the
 * only way to assert "the frame arrived and the right query went stale" is to let a component mount,
 * dispatch the event the transport would dispatch, and watch what happens. Asserting the mapping
 * function alone would leave exactly the seam that has broken here before: a subscription to a name
 * that never fires is invisible to a test of the map.
 */
GlobalRegistrator.register()

/**
 * React only runs `act()` for real when it is told it is in a test environment; without this it warns
 * "the current testing environment is not configured to support act(...)" and does NOT flush effects —
 * which would leave a subscription test green because nothing ever subscribed.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

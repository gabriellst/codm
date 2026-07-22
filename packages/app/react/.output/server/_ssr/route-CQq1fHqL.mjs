import { c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { O as Outlet, L as Link } from "../_libs/tanstack__react-router.mjs";
import { c as cn } from "./router-NNnLbzcz.mjs";
import { u as useGetHomeDashboard, g as getHomeDashboardQueryKey } from "./useGetHomeDashboard-DiPbV2MB.mjs";
import { u as useGetIssuesOverview } from "./useGetIssuesOverview-DppPbMnY.mjs";
import { u as useListWorkspaces } from "./useListWorkspaces-TSrW7uqX.mjs";
import { L as Logo } from "./Logo-yUfi7q_5.mjs";
import { T as ThreadAvatar } from "./ThreadAvatar-DOwlc1eN.mjs";
import { T as ThreadStatusDot, D as Dot } from "./StatusDot-CDKvP_k7.mjs";
import { u as useQueryClient } from "../_libs/tanstack__react-query.mjs";
import { u as useServerEventSource, a as useServerEvents } from "./useServerEvents-Dhc918lv.mjs";
import { D as Dialog } from "./dialog-CDhCxi7G.mjs";
import { u as useDialogStore } from "./useDialogStore-CSOxdFcF.mjs";
import "../_libs/i18next.mjs";
import "../_libs/sonner.mjs";
import "./avatar-CUy_TWwL.mjs";
import { c as create } from "../_libs/zustand.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { I as IconHome, a as IconListDetails, b as IconAntennaBars5, c as IconFolder, d as IconSettings, e as IconPlus } from "../_libs/tabler__icons-react.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/isbot.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/clsx.mjs";
import "../_libs/class-variance-authority.mjs";
import "../_libs/tailwind-merge.mjs";
import "../_libs/tanstack__react-query-devtools.mjs";
import "../_libs/@tanstack/react-router-devtools+[...].mjs";
import "../_libs/base-ui__react.mjs";
import "../_libs/base-ui__utils.mjs";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/zod.mjs";
import "../_http-B7Tvv7R3.mjs";
import "./glyphs-D8fG7IZJ.mjs";
import "../_libs/microsoft__fetch-event-source.mjs";
import "./spinner-BF9CKMGy.mjs";
const rowBase = "flex items-center gap-3 rounded-xl px-3 h-11 text-sm font-medium transition-colors";
const rowIdle = "text-sidebar-foreground/80 hover:bg-sidebar-accent/60";
const rowActive = "bg-sidebar-accent text-sidebar-foreground";
function Sidebar({ className }) {
  const { t } = useTranslation();
  const { data: dashboard } = useGetHomeDashboard();
  const { data: workspaces } = useListWorkspaces();
  const { data: issues } = useGetIssuesOverview();
  const issueCount = issues ? issues.statsLine.awaitingInput + issues.statsLine.working + issues.statsLine.completed : void 0;
  const channelCount = dashboard?.channels.filter((c) => c.status === "CONNECTED").length;
  const workspaceCount = workspaces?.workspaces.length;
  const threads = dashboard?.activeSessions ?? [];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("aside", { className: cn("bg-sidebar flex w-60 shrink-0 flex-col gap-6 border-r border-sidebar-border px-4 py-6", className), children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "px-1", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Logo, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
      lineNumber: 38,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
      lineNumber: 37,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("nav", { className: "flex flex-col gap-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(NavItem, { to: "/dashboard", icon: IconHome, label: "Home" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
        lineNumber: 42,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(NavItem, { to: "/issues", icon: IconListDetails, label: "Issues", count: issueCount }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
        lineNumber: 43,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(NavItem, { to: "/channels", icon: IconAntennaBars5, label: "Channels", count: channelCount }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
        lineNumber: 44,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(NavItem, { to: "/workspaces", icon: IconFolder, label: "Workspaces", count: workspaceCount }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
        lineNumber: 45,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(NavItem, { to: "/settings", icon: IconSettings, label: "Settings" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
        lineNumber: 46,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
      lineNumber: 41,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex min-h-0 flex-1 flex-col gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between px-2", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "label-eyebrow", children: t("console.threads") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
          lineNumber: 51,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          Link,
          {
            to: "/attach",
            "aria-label": t("console.attachThread"),
            className: "flex size-6 items-center justify-center rounded-full text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconPlus, { className: "size-4" }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
              lineNumber: 57,
              columnNumber: 7
            }, this)
          },
          void 0,
          false,
          {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
            lineNumber: 52,
            columnNumber: 6
          },
          this
        )
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
        lineNumber: 50,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-0.5 overflow-y-auto", children: threads.length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "px-3 py-1 text-sm text-muted-foreground", children: t("console.noThreadsYet") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
        lineNumber: 63,
        columnNumber: 7
      }, this) : threads.map((thread) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        Link,
        {
          to: "/threads/$threadId",
          params: { threadId: thread.threadId },
          className: cn(rowBase, rowIdle, "h-12"),
          activeProps: { className: cn(rowBase, rowActive, "h-12") },
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ThreadAvatar, { name: thread.displayName, channelKind: thread.channelKind, size: "sm" }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
              lineNumber: 73,
              columnNumber: 9
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex-1 truncate", children: thread.displayName }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
              lineNumber: 74,
              columnNumber: 9
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ThreadStatusDot, { status: thread.status }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
              lineNumber: 75,
              columnNumber: 9
            }, this)
          ]
        },
        thread.threadId,
        true,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
          lineNumber: 66,
          columnNumber: 8
        },
        this
      )) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
        lineNumber: 61,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
      lineNumber: 49,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
    lineNumber: 36,
    columnNumber: 3
  }, this);
}
function NavItem({ to, icon: Glyph, label, count }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Link, { to, className: cn(rowBase, rowIdle), activeProps: { className: cn(rowBase, rowActive) }, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Glyph, { className: "size-5 shrink-0" }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
      lineNumber: 88,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex-1 truncate", children: label }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
      lineNumber: 89,
      columnNumber: 4
    }, this),
    count !== void 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm tabular-nums text-muted-foreground", children: count }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
      lineNumber: 90,
      columnNumber: 28
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/Navbar/index.tsx",
    lineNumber: 87,
    columnNumber: 3
  }, this);
}
function AgentsRunningPill() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useGetHomeDashboard();
  useServerEvents("browser.thread_status_changed", () => {
    queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() });
  });
  const count = data?.agentsRunningNow ?? 0;
  const running = count > 0;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "inline-flex items-center gap-2 rounded-full bg-secondary px-3.5 py-1.5 text-sm font-medium text-secondary-foreground shadow-sm", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Dot, { className: running ? "bg-success" : "bg-muted-foreground/40" }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/AgentsRunningPill.tsx",
      lineNumber: 27,
      columnNumber: 4
    }, this),
    t("console.agentsRunning", { count })
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/console/AgentsRunningPill.tsx",
    lineNumber: 26,
    columnNumber: 3
  }, this);
}
const CLOSE_ANIMATION_MS = 250;
const useDrawerStore = create((set) => ({
  content: null,
  open: false,
  show: (content) => set({ content, open: true }),
  hide: () => {
    set({ open: false });
    setTimeout(() => {
      if (!useDrawerStore.getState().open) {
        set({ content: null });
      }
    }, CLOSE_ANIMATION_MS);
  }
}));
function AuthLayout() {
  useServerEventSource();
  const {
    content,
    open,
    hide
  } = useDialogStore();
  const drawerContent = useDrawerStore((s) => s.content);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex h-dvh overflow-hidden bg-route-background text-foreground", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Sidebar, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/route.tsx?tsr-split=component",
      lineNumber: 18,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("main", { className: "relative flex flex-1 flex-col overflow-hidden", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "pointer-events-none absolute right-6 top-5 z-20", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "pointer-events-auto", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AgentsRunningPill, {}, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/route.tsx?tsr-split=component",
        lineNumber: 23,
        columnNumber: 7
      }, this) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/route.tsx?tsr-split=component",
        lineNumber: 22,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/route.tsx?tsr-split=component",
        lineNumber: 21,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex-1 overflow-auto", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Outlet, {}, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/route.tsx?tsr-split=component",
        lineNumber: 27,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/route.tsx?tsr-split=component",
        lineNumber: 26,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/route.tsx?tsr-split=component",
      lineNumber: 19,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Dialog, { open, onOpenChange: (isOpen) => !isOpen && hide(), children: content }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/route.tsx?tsr-split=component",
      lineNumber: 30,
      columnNumber: 4
    }, this),
    drawerContent
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/route.tsx?tsr-split=component",
    lineNumber: 17,
    columnNumber: 10
  }, this);
}
export {
  AuthLayout as component
};

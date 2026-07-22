import { c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { c as cn, B as Button } from "./router-NNnLbzcz.mjs";
import { f as fetch } from "../_http-B7Tvv7R3.mjs";
import { a as useQuery, u as useQueryClient, q as queryOptions } from "../_libs/tanstack__react-query.mjs";
import { S as Skeleton } from "./skeleton-CMW2_JAA.mjs";
import { L as Link } from "../_libs/tanstack__react-router.mjs";
import { C as Card, d as CardContent, e as CardFooter, a as CardHeader, b as CardTitle } from "./card-f5vvoeSM.mjs";
import { u as useGetHomeDashboard, g as getHomeDashboardQueryKey } from "./useGetHomeDashboard-DiPbV2MB.mjs";
import { e as enumLabel } from "./enums-By4KP5D8.mjs";
import { a as useServerEvents } from "./useServerEvents-Dhc918lv.mjs";
import { b as channelGlyph, c as channelLabel } from "./glyphs-D8fG7IZJ.mjs";
import { T as ThreadStatusDot, D as Dot } from "./StatusDot-CDKvP_k7.mjs";
import { T as ThreadAvatar } from "./ThreadAvatar-DOwlc1eN.mjs";
import "../_libs/i18next.mjs";
import "../_libs/sonner.mjs";
import "./avatar-CUy_TWwL.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { h as IconCheck } from "../_libs/tabler__icons-react.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/clsx.mjs";
import "../_libs/class-variance-authority.mjs";
import "../_libs/tailwind-merge.mjs";
import "../_libs/tanstack__react-query-devtools.mjs";
import "../_libs/@tanstack/react-router-devtools+[...].mjs";
import "../_libs/base-ui__react.mjs";
import "../_libs/base-ui__utils.mjs";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/zod.mjs";
import "../_libs/isbot.mjs";
import "../_libs/microsoft__fetch-event-source.mjs";
function getGetSetupChecklistUrl() {
  const res = { method: "GET", url: `/v1/ui/setup-checklist` };
  return res;
}
async function getSetupChecklist(config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const res = await request({ method: "GET", url: getGetSetupChecklistUrl().url.toString(), ...requestConfig });
  return res.data;
}
const getSetupChecklistQueryKey = () => [{ url: "/v1/ui/setup-checklist" }];
function getSetupChecklistQueryOptions(config = {}) {
  const queryKey = getSetupChecklistQueryKey();
  return queryOptions({
    queryKey,
    queryFn: async ({ signal }) => {
      return getSetupChecklist({ ...config, signal: config.signal ?? signal });
    }
  });
}
function useGetSetupChecklist(options = {}) {
  const { query: queryConfig = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...resolvedOptions } = queryConfig;
  const queryKey = resolvedOptions?.queryKey ?? getSetupChecklistQueryKey();
  const query = useQuery({
    ...getSetupChecklistQueryOptions(config),
    ...resolvedOptions,
    queryKey
  }, queryClient);
  query.queryKey = queryKey;
  return query;
}
function greeting(now = /* @__PURE__ */ new Date()) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
function SetupChecklist({ checklist }) {
  const { t } = useTranslation();
  const steps = [
    { n: 1, title: t("home.setupChannelTitle"), description: t("home.setupChannelDesc"), to: "/channels", done: checklist.channelDone },
    {
      n: 2,
      title: t("home.setupWorkspaceTitle"),
      description: t("home.setupWorkspaceDesc"),
      to: "/workspaces",
      done: checklist.workspaceDone
    },
    { n: 3, title: t("home.setupThreadTitle"), description: t("home.setupThreadDesc"), to: "/attach", done: checklist.threadDone }
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mx-auto flex w-full max-w-2xl flex-col items-center gap-8 px-6 pb-16 pt-24 text-center", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-muted-foreground", children: greeting() }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx",
        lineNumber: 41,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h1", { className: "heading-display text-4xl text-foreground md:text-5xl", children: t("home.welcome") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx",
        lineNumber: 42,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-muted-foreground", children: t("home.welcomeSubtitle") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx",
        lineNumber: 43,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx",
      lineNumber: 40,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { className: "w-full text-left", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardContent, { className: "flex flex-col gap-1 p-2", children: steps.map((step) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4 rounded-2xl p-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "span",
          {
            className: cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
              step.done ? "border-transparent bg-primary text-primary-foreground" : "border-border text-foreground"
            ),
            children: step.done ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconCheck, { className: "size-4" }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx",
              lineNumber: 56,
              columnNumber: 22
            }, this) : step.n
          },
          void 0,
          false,
          {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx",
            lineNumber: 50,
            columnNumber: 8
          },
          this
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-1 flex-col", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm font-semibold text-foreground", children: step.title }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx",
            lineNumber: 59,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-muted-foreground", children: step.description }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx",
            lineNumber: 60,
            columnNumber: 9
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx",
          lineNumber: 58,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { size: "sm", variant: step.done ? "outline" : "default", render: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Link, { to: step.to }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx",
          lineNumber: 62,
          columnNumber: 78
        }, this), children: step.done ? t("home.setupDone") : t("home.setupCta") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx",
          lineNumber: 62,
          columnNumber: 8
        }, this)
      ] }, step.n, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx",
        lineNumber: 49,
        columnNumber: 7
      }, this)) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx",
        lineNumber: 47,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardFooter, { className: "justify-end border-t border-border pt-4 text-sm", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Link, { to: "/onboarding", className: "font-medium text-foreground underline-offset-4 hover:underline", children: t("home.replayIntro") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx",
        lineNumber: 69,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx",
        lineNumber: 68,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx",
      lineNumber: 46,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.tsx",
    lineNumber: 39,
    columnNumber: 3
  }, this);
}
function HomeDashboard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetHomeDashboard();
  useServerEvents(["browser.thread_status_changed", "browser.stop_raised"], () => {
    queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() });
  });
  if (isLoading || !data) return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DashboardSkeleton, {}, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
    lineNumber: 29,
    columnNumber: 33
  }, this);
  const running = data.agentsRunningNow;
  const headline = running === 0 ? t("dashboard.agentsWorkingNone") : t("dashboard.agentsWorking", { count: running });
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-16 pt-20 md:px-10", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-muted-foreground", children: greeting() }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
        lineNumber: 37,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h1", { className: "heading-display text-4xl text-foreground md:text-5xl", children: headline }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
        lineNumber: 38,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 36,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid gap-6 lg:grid-cols-[1.6fr_1fr]", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-6", children: [
        data.needsYou && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(NeedsYouCallout, { needsYou: data.needsYou }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
          lineNumber: 43,
          columnNumber: 24
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ActiveSessions, { sessions: data.activeSessions }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
          lineNumber: 44,
          columnNumber: 6
        }, this),
        data.latestActivity.length > 0 && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(LatestActivity, { items: data.latestActivity }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
          lineNumber: 45,
          columnNumber: 41
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
        lineNumber: 42,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-6", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TodayCard, { today: data.today }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
          lineNumber: 48,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChannelsCard, { channels: data.channels }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
          lineNumber: 49,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
        lineNumber: 47,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 41,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
    lineNumber: 35,
    columnNumber: 3
  }, this);
}
function NeedsYouCallout({ needsYou }) {
  const { t } = useTranslation();
  const detail = needsYou.stopKinds.map((k) => enumLabel("StopKind", k)).join(" · ") || t("session.agentStopped");
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { className: "border-warning/50", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardContent, { className: "flex items-center gap-4 p-5", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground text-lg font-bold text-background", children: "!" }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 62,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-1 flex-col", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-semibold text-foreground", children: t("dashboard.needsYouName", { name: needsYou.threadDisplayName }) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
        lineNumber: 66,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm text-muted-foreground", children: detail }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
        lineNumber: 67,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 65,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { size: "sm", render: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Link, { to: "/threads/$threadId", params: { threadId: needsYou.threadId } }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 69,
      columnNumber: 31
    }, this), children: t("dashboard.openSession") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 69,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
    lineNumber: 61,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
    lineNumber: 60,
    columnNumber: 3
  }, this);
}
function ActiveSessions({ sessions }) {
  const { t } = useTranslation();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "flex flex-col gap-3", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-semibold text-foreground", children: t("dashboard.activeSessions") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 81,
      columnNumber: 4
    }, this),
    sessions.length === 0 ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-muted-foreground", children: t("dashboard.noActiveSessions") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 83,
      columnNumber: 5
    }, this) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card", children: sessions.map((session) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Link,
      {
        to: "/threads/$threadId",
        params: { threadId: session.threadId },
        className: "flex items-center gap-3 p-4 transition-colors hover:bg-muted",
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ThreadAvatar, { name: session.displayName, channelKind: session.channelKind }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
            lineNumber: 93,
            columnNumber: 8
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex min-w-0 flex-1 flex-col", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "truncate font-medium text-foreground", children: session.displayName }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
              lineNumber: 95,
              columnNumber: 9
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "truncate text-sm text-muted-foreground", children: session.lastActivity }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
              lineNumber: 96,
              columnNumber: 9
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
            lineNumber: 94,
            columnNumber: 8
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "span",
            {
              className: cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
                session.status === "RUNNING" ? "bg-primary text-primary-foreground" : "border border-border text-foreground"
              ),
              children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ThreadStatusDot, { status: session.status }, void 0, false, {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
                  lineNumber: 104,
                  columnNumber: 9
                }, this),
                enumLabel("ThreadStatus", session.status)
              ]
            },
            void 0,
            true,
            {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
              lineNumber: 98,
              columnNumber: 8
            },
            this
          )
        ]
      },
      session.threadId,
      true,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
        lineNumber: 87,
        columnNumber: 7
      },
      this
    )) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 85,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
    lineNumber: 80,
    columnNumber: 3
  }, this);
}
function LatestActivity({ items }) {
  const { t } = useTranslation();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "flex flex-col gap-3", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "text-lg font-semibold text-foreground", children: t("dashboard.latestActivity") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 119,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: items.map((item) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Link,
      {
        to: "/threads/$threadId",
        params: { threadId: item.threadId },
        className: "flex items-baseline gap-3 text-sm",
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Dot, { className: "mt-1.5 bg-muted-foreground/40" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
            lineNumber: 128,
            columnNumber: 7
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex-1", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-medium text-foreground", children: item.title }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
              lineNumber: 130,
              columnNumber: 8
            }, this),
            " ",
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-muted-foreground", children: item.subtitle }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
              lineNumber: 131,
              columnNumber: 8
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
            lineNumber: 129,
            columnNumber: 7
          }, this)
        ]
      },
      `${item.threadId}-${item.at}`,
      true,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
        lineNumber: 122,
        columnNumber: 6
      },
      this
    )) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 120,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
    lineNumber: 118,
    columnNumber: 3
  }, this);
}
function TodayCard({ today }) {
  const { t } = useTranslation();
  const rows = [
    { label: t("dashboard.issuesOpened"), value: String(today.issuesOpened) },
    { label: t("dashboard.issuesClosed"), value: String(today.issuesClosed) },
    { label: t("dashboard.medianResponse"), value: `${Math.round(today.medianResponseSeconds)}s` }
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardHeader, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardTitle, { children: t("dashboard.today") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 150,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 149,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardContent, { className: "flex flex-col gap-5", children: rows.map((row) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "label-eyebrow", children: row.label }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
        lineNumber: 155,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-2xl font-bold tabular-nums text-foreground", children: row.value }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
        lineNumber: 156,
        columnNumber: 7
      }, this)
    ] }, row.label, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 154,
      columnNumber: 6
    }, this)) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 152,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
    lineNumber: 148,
    columnNumber: 3
  }, this);
}
function ChannelsCard({ channels }) {
  const { t } = useTranslation();
  if (channels.length === 0) return null;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardHeader, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardTitle, { children: t("dashboard.channels") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 170,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 169,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardContent, { className: "flex flex-col gap-3", children: channels.map((channel) => {
      const Glyph = channelGlyph[channel.kind];
      const connected = channel.status === "CONNECTED";
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Glyph, { className: "size-4" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
          lineNumber: 179,
          columnNumber: 9
        }, this) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
          lineNumber: 178,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex-1 text-sm font-medium text-foreground", children: channelLabel[channel.kind] }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
          lineNumber: 181,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "inline-flex items-center gap-2 text-xs text-muted-foreground", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Dot, { className: connected ? "bg-success" : "bg-muted-foreground/40" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
            lineNumber: 183,
            columnNumber: 9
          }, this),
          enumLabel("ChannelStatus", channel.status)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
          lineNumber: 182,
          columnNumber: 8
        }, this)
      ] }, channel.kind, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
        lineNumber: 177,
        columnNumber: 7
      }, this);
    }) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 172,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
    lineNumber: 168,
    columnNumber: 3
  }, this);
}
function DashboardSkeleton() {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-16 pt-20 md:px-10", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-4 w-28" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
        lineNumber: 198,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-12 w-96" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
        lineNumber: 199,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 197,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid gap-6 lg:grid-cols-[1.6fr_1fr]", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-64 rounded-2xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
        lineNumber: 202,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-64 rounded-2xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
        lineNumber: 203,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
      lineNumber: 201,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeDashboard/index.tsx",
    lineNumber: 196,
    columnNumber: 3
  }, this);
}
function HomeSection() {
  const { data, isLoading } = useGetSetupChecklist();
  if (isLoading || !data) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-6 pt-24", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-10 w-72" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeSection/index.tsx",
        lineNumber: 17,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-64 w-full max-w-xl rounded-2xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeSection/index.tsx",
        lineNumber: 18,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeSection/index.tsx",
      lineNumber: 16,
      columnNumber: 4
    }, this);
  }
  return data.threadDone ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(HomeDashboard, {}, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeSection/index.tsx",
    lineNumber: 23,
    columnNumber: 27
  }, this) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SetupChecklist, { checklist: data }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/-components/HomeSection/index.tsx",
    lineNumber: 23,
    columnNumber: 47
  }, this);
}
function RouteComponent() {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(HomeSection, {}, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/dashboard/index.tsx?tsr-split=component",
    lineNumber: 3,
    columnNumber: 10
  }, this);
}
export {
  RouteComponent as component
};

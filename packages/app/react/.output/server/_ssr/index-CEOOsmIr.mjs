import { c as jsxDevRuntimeExports, r as reactExports } from "../_libs/react.mjs";
import { P as PageHeader } from "./PageHeader-D0tGWiN4.mjs";
import { S as Separator } from "./separator-Umrs0kja.mjs";
import "./router-NNnLbzcz.mjs";
import { f as fetch } from "../_http-B7Tvv7R3.mjs";
import { u as useQueryClient, a as useQuery, b as useMutation, q as queryOptions, m as mutationOptions } from "../_libs/tanstack__react-query.mjs";
import { e as enumLabel } from "./enums-By4KP5D8.mjs";
import { a as providerGlyph, p as providerLabel } from "./glyphs-D8fG7IZJ.mjs";
import { B as Badge } from "./badge-CKHT7bhp.mjs";
import { S as Skeleton } from "./skeleton-CMW2_JAA.mjs";
import { S as Switch } from "./switch-BiZsBu9O.mjs";
import "../_libs/i18next.mjs";
import "../_libs/sonner.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import "../_libs/tanstack__react-router.mjs";
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
import "../_libs/tabler__icons-react.mjs";
import "../_libs/base-ui__react.mjs";
import "../_libs/base-ui__utils.mjs";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/clsx.mjs";
import "../_libs/class-variance-authority.mjs";
import "../_libs/tailwind-merge.mjs";
import "../_libs/tanstack__react-query-devtools.mjs";
import "../_libs/@tanstack/react-router-devtools+[...].mjs";
import "../_libs/zod.mjs";
function getDetectProvidersUrl() {
  const res = { method: "GET", url: `/v1/terminal/providers` };
  return res;
}
async function detectProviders(params, config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const res = await request({ method: "GET", url: getDetectProvidersUrl().url.toString(), params, ...requestConfig });
  return res.data;
}
function getGetSettingsUrl() {
  const res = { method: "GET", url: `/v1/ui/settings` };
  return res;
}
async function getSettings(config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const res = await request({ method: "GET", url: getGetSettingsUrl().url.toString(), ...requestConfig });
  return res.data;
}
function getUpdateStopCriteriaUrl() {
  const res = { method: "PUT", url: `/v1/settings/stop-criteria` };
  return res;
}
async function updateStopCriteria(data, config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const requestData = data;
  const res = await request({ method: "PUT", url: getUpdateStopCriteriaUrl().url.toString(), data: requestData, ...requestConfig });
  return res.data;
}
const detectProvidersQueryKey = (params) => [{ url: "/v1/terminal/providers" }, ...[]];
function detectProvidersQueryOptions(params, config = {}) {
  const queryKey = detectProvidersQueryKey();
  return queryOptions({
    queryKey,
    queryFn: async ({ signal }) => {
      return detectProviders(params, { ...config, signal: config.signal ?? signal });
    }
  });
}
function useDetectProviders(params, options = {}) {
  const { query: queryConfig = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...resolvedOptions } = queryConfig;
  const queryKey = resolvedOptions?.queryKey ?? detectProvidersQueryKey();
  const query = useQuery({
    ...detectProvidersQueryOptions(params, config),
    ...resolvedOptions,
    queryKey
  }, queryClient);
  query.queryKey = queryKey;
  return query;
}
const getSettingsQueryKey = () => [{ url: "/v1/ui/settings" }];
function getSettingsQueryOptions(config = {}) {
  const queryKey = getSettingsQueryKey();
  return queryOptions({
    queryKey,
    queryFn: async ({ signal }) => {
      return getSettings({ ...config, signal: config.signal ?? signal });
    }
  });
}
function useGetSettings(options = {}) {
  const { query: queryConfig = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...resolvedOptions } = queryConfig;
  const queryKey = resolvedOptions?.queryKey ?? getSettingsQueryKey();
  const query = useQuery({
    ...getSettingsQueryOptions(config),
    ...resolvedOptions,
    queryKey
  }, queryClient);
  query.queryKey = queryKey;
  return query;
}
const updateStopCriteriaMutationKey = () => [{ url: "/v1/settings/stop-criteria" }];
function updateStopCriteriaMutationOptions(config = {}) {
  const mutationKey = updateStopCriteriaMutationKey();
  return mutationOptions({
    mutationKey,
    mutationFn: async ({ data }) => {
      return updateStopCriteria(data, config);
    }
  });
}
function useUpdateStopCriteria(options = {}) {
  const { mutation = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...mutationOptions2 } = mutation;
  const mutationKey = mutationOptions2.mutationKey ?? updateStopCriteriaMutationKey();
  const baseOptions = updateStopCriteriaMutationOptions(config);
  return useMutation({
    ...baseOptions,
    mutationKey,
    ...mutationOptions2
  }, queryClient);
}
function ProvidersSection() {
  const { t } = useTranslation();
  const { data, isLoading } = useDetectProviders();
  const providers = data?.providers ?? [];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "flex flex-col gap-3", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "label-eyebrow", children: t("settings.agentProviders") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/ProvidersSection/index.tsx",
      lineNumber: 16,
      columnNumber: 4
    }, this),
    isLoading ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-14 rounded-2xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/ProvidersSection/index.tsx",
        lineNumber: 19,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-14 rounded-2xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/ProvidersSection/index.tsx",
        lineNumber: 20,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/ProvidersSection/index.tsx",
      lineNumber: 18,
      columnNumber: 5
    }, this) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: providers.map((provider) => {
      const Glyph = providerGlyph[provider.name];
      const detected = provider.status === "DETECTED";
      const path = provider.binaryPath ?? t("settings.providerNotFound");
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4 rounded-2xl px-2 py-3", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Glyph, { className: "size-5" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/ProvidersSection/index.tsx",
          lineNumber: 31,
          columnNumber: 10
        }, this) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/ProvidersSection/index.tsx",
          lineNumber: 30,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex min-w-0 flex-1 flex-col", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-semibold text-foreground", children: providerLabel[provider.name] }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/ProvidersSection/index.tsx",
            lineNumber: 34,
            columnNumber: 10
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "truncate font-mono text-xs text-muted-foreground", children: [
            path,
            provider.version ? ` · v${provider.version}` : ""
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/ProvidersSection/index.tsx",
            lineNumber: 35,
            columnNumber: 10
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/ProvidersSection/index.tsx",
          lineNumber: 33,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Badge, { variant: detected ? "secondary" : "outline", children: enumLabel("ProviderStatus", provider.status) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/ProvidersSection/index.tsx",
          lineNumber: 40,
          columnNumber: 9
        }, this)
      ] }, provider.name, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/ProvidersSection/index.tsx",
        lineNumber: 29,
        columnNumber: 8
      }, this);
    }) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/ProvidersSection/index.tsx",
      lineNumber: 23,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/ProvidersSection/index.tsx",
    lineNumber: 15,
    columnNumber: 3
  }, this);
}
const CRITERIA = [
  { key: "serverErrors", labelKey: "settings.criteriaServerErrors", descKey: "settings.criteriaServerErrorsDesc" },
  { key: "blockedByClassification", labelKey: "settings.criteriaBlocked", descKey: "settings.criteriaBlockedDesc" },
  { key: "humanRequested", labelKey: "settings.criteriaHumanRequested", descKey: "settings.criteriaHumanRequestedDesc" },
  { key: "approvalNeeded", labelKey: "settings.criteriaApprovalNeeded", descKey: "settings.criteriaApprovalNeededDesc" }
];
function StopCriteriaSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetSettings();
  const update = useUpdateStopCriteria();
  const [criteria, setCriteria] = reactExports.useState(null);
  reactExports.useEffect(() => {
    if (data) setCriteria(data.stopCriteria);
  }, [data]);
  const toggle = (key, value) => {
    if (!criteria) return;
    const next = { ...criteria, [key]: value };
    setCriteria(next);
    update.mutate({ data: { stopCriteria: next } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getSettingsQueryKey() }) });
  };
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "flex flex-col gap-3", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "label-eyebrow", children: t("settings.stopCriteria") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/StopCriteriaSection/index.tsx",
        lineNumber: 44,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-muted-foreground", children: t("settings.stopCriteriaDescription") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/StopCriteriaSection/index.tsx",
        lineNumber: 45,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/StopCriteriaSection/index.tsx",
      lineNumber: 43,
      columnNumber: 4
    }, this),
    isLoading || !criteria ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-12 rounded-xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/StopCriteriaSection/index.tsx",
        lineNumber: 49,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-12 rounded-xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/StopCriteriaSection/index.tsx",
        lineNumber: 50,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/StopCriteriaSection/index.tsx",
      lineNumber: 48,
      columnNumber: 5
    }, this) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card", children: CRITERIA.map((item) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("label", { className: "flex cursor-pointer items-center gap-4 p-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-1 flex-col gap-0.5", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "font-medium text-foreground", children: t(item.labelKey) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/StopCriteriaSection/index.tsx",
          lineNumber: 57,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm text-muted-foreground", children: t(item.descKey) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/StopCriteriaSection/index.tsx",
          lineNumber: 58,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/StopCriteriaSection/index.tsx",
        lineNumber: 56,
        columnNumber: 8
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Switch, { checked: criteria[item.key], onCheckedChange: (value) => toggle(item.key, value) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/StopCriteriaSection/index.tsx",
        lineNumber: 60,
        columnNumber: 8
      }, this)
    ] }, item.key, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/StopCriteriaSection/index.tsx",
      lineNumber: 55,
      columnNumber: 7
    }, this)) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/StopCriteriaSection/index.tsx",
      lineNumber: 53,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/StopCriteriaSection/index.tsx",
    lineNumber: 42,
    columnNumber: 3
  }, this);
}
function GeneralSection() {
  const { t } = useTranslation();
  const { data, isLoading } = useGetSettings();
  if (isLoading || !data) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "flex flex-col gap-3", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "label-eyebrow", children: t("settings.general") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/GeneralSection/index.tsx",
        lineNumber: 13,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-24 rounded-2xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/GeneralSection/index.tsx",
        lineNumber: 14,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/GeneralSection/index.tsx",
      lineNumber: 12,
      columnNumber: 4
    }, this);
  }
  const rows = [
    { label: t("settings.generalOperator"), value: data.general.operatorName },
    { label: t("settings.generalTimezone"), value: data.general.timezone },
    { label: t("settings.generalDataDir"), value: data.general.dataDir, mono: true },
    { label: t("settings.generalAppVersion"), value: data.appVersion, mono: true }
  ];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("section", { className: "flex flex-col gap-3", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h2", { className: "label-eyebrow", children: t("settings.general") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/GeneralSection/index.tsx",
      lineNumber: 28,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card", children: rows.map((row) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-between gap-4 p-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm font-medium text-foreground", children: row.label }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/GeneralSection/index.tsx",
        lineNumber: 32,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: `truncate text-sm text-muted-foreground ${row.mono ? "font-mono text-xs" : ""}`, children: row.value }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/GeneralSection/index.tsx",
        lineNumber: 33,
        columnNumber: 7
      }, this)
    ] }, row.label, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/GeneralSection/index.tsx",
      lineNumber: 31,
      columnNumber: 6
    }, this)) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/GeneralSection/index.tsx",
      lineNumber: 29,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/GeneralSection/index.tsx",
    lineNumber: 27,
    columnNumber: 3
  }, this);
}
function SettingsSection() {
  const { t } = useTranslation();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-16 pt-20", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PageHeader, { title: t("settings.title") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/SettingsSection/index.tsx",
      lineNumber: 13,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ProvidersSection, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/SettingsSection/index.tsx",
      lineNumber: 14,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Separator, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/SettingsSection/index.tsx",
      lineNumber: 15,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(StopCriteriaSection, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/SettingsSection/index.tsx",
      lineNumber: 16,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Separator, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/SettingsSection/index.tsx",
      lineNumber: 17,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(GeneralSection, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/SettingsSection/index.tsx",
      lineNumber: 18,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/-components/SettingsSection/index.tsx",
    lineNumber: 12,
    columnNumber: 3
  }, this);
}
function RouteComponent() {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SettingsSection, {}, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/index.tsx?tsr-split=component",
    lineNumber: 3,
    columnNumber: 10
  }, this);
}
export {
  RouteComponent as component
};

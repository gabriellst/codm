import { c as jsxDevRuntimeExports } from "../_libs/react.mjs";
import { g as Route$2, E as Empty, b as EmptyTitle, d as EmptyDescription } from "./router-NNnLbzcz.mjs";
import { f as fetch } from "../_http-B7Tvv7R3.mjs";
import { a as useQuery, q as queryOptions } from "../_libs/tanstack__react-query.mjs";
import { S as Skeleton } from "./skeleton-CMW2_JAA.mjs";
import { e as enumLabel } from "./enums-By4KP5D8.mjs";
import "../_libs/i18next.mjs";
import "../_libs/sonner.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { x as IconLink, y as IconFile, z as IconPhoto } from "../_libs/tabler__icons-react.mjs";
import "../_libs/tanstack__query-core.mjs";
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
function getListArtifactsUrl(threadId) {
  const res = { method: "GET", url: `/v1/threads/${threadId}/artifacts` };
  return res;
}
async function listArtifacts(threadId, config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const res = await request({ method: "GET", url: getListArtifactsUrl(threadId).url.toString(), ...requestConfig });
  return res.data;
}
const listArtifactsQueryKey = (threadId) => [{ url: "/v1/threads/:threadId/artifacts", params: { threadId } }];
function listArtifactsQueryOptions(threadId, config = {}) {
  const queryKey = listArtifactsQueryKey(threadId);
  return queryOptions({
    enabled: !!threadId,
    queryKey,
    queryFn: async ({ signal }) => {
      return listArtifacts(threadId, { ...config, signal: config.signal ?? signal });
    }
  });
}
function useListArtifacts(threadId, options = {}) {
  const { query: queryConfig = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...resolvedOptions } = queryConfig;
  const queryKey = resolvedOptions?.queryKey ?? listArtifactsQueryKey(threadId);
  const query = useQuery({
    ...listArtifactsQueryOptions(threadId, config),
    ...resolvedOptions,
    queryKey
  }, queryClient);
  query.queryKey = queryKey;
  return query;
}
const artifactGlyph = { IMAGE: IconPhoto, FILE: IconFile, LINK: IconLink };
function ArtifactsSection({ threadId }) {
  const { t } = useTranslation();
  const { data, isLoading } = useListArtifacts(threadId);
  const artifacts = data?.artifacts ?? [];
  if (isLoading) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid gap-4 py-4 sm:grid-cols-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-40 rounded-2xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ArtifactsSection/index.tsx",
        lineNumber: 23,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-40 rounded-2xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ArtifactsSection/index.tsx",
        lineNumber: 24,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ArtifactsSection/index.tsx",
      lineNumber: 22,
      columnNumber: 4
    }, this);
  }
  if (artifacts.length === 0) {
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Empty, { className: "py-16", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyTitle, { children: t("session.artifactsEmptyTitle") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ArtifactsSection/index.tsx",
        lineNumber: 32,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(EmptyDescription, { children: t("session.artifactsEmptyDescription") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ArtifactsSection/index.tsx",
        lineNumber: 33,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ArtifactsSection/index.tsx",
      lineNumber: 31,
      columnNumber: 4
    }, this);
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid gap-4 py-4 sm:grid-cols-2", children: artifacts.map((artifact) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ArtifactCard, { artifact }, artifact.artifactId, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ArtifactsSection/index.tsx",
    lineNumber: 41,
    columnNumber: 5
  }, this)) }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ArtifactsSection/index.tsx",
    lineNumber: 39,
    columnNumber: 3
  }, this);
}
function ArtifactCard({ artifact }) {
  const Glyph = artifactGlyph[artifact.kind];
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col overflow-hidden rounded-2xl border border-border bg-card", children: [
    artifact.kind === "IMAGE" && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "div",
      {
        className: "h-32 w-full border-b border-border",
        style: {
          backgroundImage: "repeating-linear-gradient(45deg, oklch(0.95 0 0) 0 10px, oklch(0.92 0 0) 10px 20px)"
        }
      },
      void 0,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ArtifactsSection/index.tsx",
        lineNumber: 52,
        columnNumber: 5
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-start gap-3 p-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Glyph, { className: "size-4" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ArtifactsSection/index.tsx",
        lineNumber: 61,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ArtifactsSection/index.tsx",
        lineNumber: 60,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex min-w-0 flex-1 flex-col", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "truncate font-medium text-foreground", children: artifact.name }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ArtifactsSection/index.tsx",
          lineNumber: 64,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "truncate text-sm text-muted-foreground", children: [
          enumLabel("ArtifactKind", artifact.kind),
          " · ",
          artifact.meta
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ArtifactsSection/index.tsx",
          lineNumber: 65,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ArtifactsSection/index.tsx",
        lineNumber: 63,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ArtifactsSection/index.tsx",
      lineNumber: 59,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/-components/ArtifactsSection/index.tsx",
    lineNumber: 50,
    columnNumber: 3
  }, this);
}
function RouteComponent() {
  const {
    threadId
  } = Route$2.useParams();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ArtifactsSection, { threadId }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/threads/$threadId/artifacts/index.tsx?tsr-split=component",
    lineNumber: 7,
    columnNumber: 10
  }, this);
}
export {
  RouteComponent as component
};

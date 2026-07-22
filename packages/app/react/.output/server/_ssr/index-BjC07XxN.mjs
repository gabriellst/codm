import { c as jsxDevRuntimeExports, r as reactExports } from "../_libs/react.mjs";
import { c as cn, B as Button, s as surface, u as updateProfileMutationRequestSchema, j as trigger, i as createClient } from "./router-GQ4JltwW.mjs";
import { u as useQuery, a as useQueryClient, q as queryOptions, b as useMutation, m as mutationOptions } from "../_libs/tanstack__react-query.mjs";
import { c as cva } from "../_libs/class-variance-authority.mjs";
import { U as UserIcon, c as BellIcon, u as useDialogStore, L as LockIcon, G as GradientIcon, d as DialogContent, e as DialogHeader, f as DialogTitle, g as DialogDescription, h as DialogFooter, A as Avatar, a as AvatarImage, b as AvatarFallback } from "./useDialogStore-Tnswszs7.mjs";
import { u as useForm } from "../_libs/tanstack__react-form.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { F as FieldGroup, a as Field, b as FieldLabel, I as Input, c as FieldError } from "./input-rdFGzFZO.mjs";
import { S as Spinner } from "./spinner-C0Bce5in.mjs";
import "../_libs/i18next.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { g as IconShieldCheck, h as IconKey, i as IconTrash, j as IconUpload, k as IconSelector, f as IconCheck, l as IconChevronUp, m as IconChevronDown } from "../_libs/tabler__icons-react.mjs";
import { o as object, s as string, _ as _enum } from "../_libs/zod.mjs";
import { S as SelectRoot, f as SelectTrigger$1, g as SelectIcon, h as SelectValue$1, i as SelectPortal, j as SelectPositioner, k as SelectPopup, l as SelectList, n as SelectItem$1, o as SelectItemText, p as SelectItemIndicator, q as SelectScrollUpArrow, r as SelectScrollDownArrow } from "../_libs/base-ui__react.mjs";
import "../_libs/ky.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/tanstack__react-router.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/isbot.mjs";
import "../_libs/better-auth__core.mjs";
import "../_libs/defu.mjs";
import "../_libs/better-fetch__fetch.mjs";
import "../_libs/clsx.mjs";
import "../_libs/tailwind-merge.mjs";
import "../_libs/tanstack__react-query-devtools.mjs";
import "../_libs/@tanstack/react-router-devtools+[...].mjs";
import "../_libs/nanostores.mjs";
import "../_libs/zustand.mjs";
import "../_libs/tanstack__form-core.mjs";
import "../_libs/tanstack__store.mjs";
import "../_libs/tanstack__pacer-lite.mjs";
import "../_libs/@tanstack/devtools-event-client+[...].mjs";
import "../_libs/tanstack__react-store.mjs";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/base-ui__utils.mjs";
import "../_libs/reselect.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/floating-ui__react-dom.mjs";
import "../_libs/floating-ui__dom.mjs";
import "../_libs/floating-ui__core.mjs";
import "../_libs/tabbable.mjs";
function isEnumValue(e, v) {
  return v != null && Object.values(e).includes(v);
}
const fetch = createClient("typescript");
function getGetMyAccountUrl() {
  const res = { method: "GET", url: `/v1/ui/account` };
  return res;
}
async function getMyAccount(config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const res = await request({ method: "GET", url: getGetMyAccountUrl().url.toString(), ...requestConfig });
  return res.data;
}
function getUpdateProfileUrl() {
  const res = { method: "PATCH", url: `/v1/me/profile` };
  return res;
}
async function updateProfile(data, config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const requestData = data;
  const res = await request({ method: "PATCH", url: getUpdateProfileUrl().url.toString(), data: requestData, ...requestConfig });
  return res.data;
}
const getMyAccountQueryKey = () => [{ url: "/v1/ui/account" }];
function getMyAccountQueryOptions(config = {}) {
  const queryKey = getMyAccountQueryKey();
  return queryOptions({
    queryKey,
    queryFn: async ({ signal }) => {
      return getMyAccount({ ...config, signal: config.signal ?? signal });
    }
  });
}
function useGetMyAccount(options = {}) {
  const { query: queryConfig = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...resolvedOptions } = queryConfig;
  const queryKey = resolvedOptions?.queryKey ?? getMyAccountQueryKey();
  const query = useQuery({
    ...getMyAccountQueryOptions(config),
    ...resolvedOptions,
    queryKey
  }, queryClient);
  query.queryKey = queryKey;
  return query;
}
const updateProfileMutationKey = () => [{ url: "/v1/me/profile" }];
function updateProfileMutationOptions(config = {}) {
  const mutationKey = updateProfileMutationKey();
  return mutationOptions({
    mutationKey,
    mutationFn: async ({ data }) => {
      return updateProfile(data, config);
    }
  });
}
function useUpdateProfile(options = {}) {
  const { mutation = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...mutationOptions2 } = mutation;
  const mutationKey = mutationOptions2.mutationKey ?? updateProfileMutationKey();
  const baseOptions = updateProfileMutationOptions(config);
  return useMutation({
    ...baseOptions,
    mutationKey,
    ...mutationOptions2
  }, queryClient);
}
const LanguageEnum = {
  "pt-BR": "pt-BR",
  "en-US": "en-US"
};
function useLocale() {
  const { i18n } = useTranslation();
  return i18n.language?.startsWith("en") ? "en-US" : "pt-BR";
}
function AccountHeaderSection({ title, className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: cn("flex flex-col gap-1", className), ...props, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h1", { className: "text-2xl font-bold text-foreground", children: title }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/AccountHeaderSection/index.tsx",
    lineNumber: 15,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/AccountHeaderSection/index.tsx",
    lineNumber: 14,
    columnNumber: 3
  }, this);
}
function Card({ className, size = "default", ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      "data-slot": "card",
      "data-size": size,
      className: cn(
        surface,
        "gap-4 overflow-hidden rounded-[1.5rem] pt-4 text-sm transition-all duration-200 ease-in-out has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl group/card flex flex-col",
        className
      ),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/card.tsx",
      lineNumber: 8,
      columnNumber: 3
    },
    this
  );
}
function CardHeader({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      "data-slot": "card-header",
      className: cn(
        "gap-1 rounded-t-xl px-4 group-data-[size=sm]/card:px-3 [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3 group/card-header @container/card-header grid auto-rows-min items-start has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]",
        className
      ),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/card.tsx",
      lineNumber: 23,
      columnNumber: 3
    },
    this
  );
}
function CardTitle({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      "data-slot": "card-title",
      className: cn("text-base leading-snug font-medium group-data-[size=sm]/card:text-sm", className),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/card.tsx",
      lineNumber: 36,
      columnNumber: 3
    },
    this
  );
}
function CardDescription({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { "data-slot": "card-description", className: cn("text-muted-foreground text-sm", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/card.tsx",
    lineNumber: 45,
    columnNumber: 9
  }, this);
}
function CardContent({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { "data-slot": "card-content", className: cn("px-4 group-data-[size=sm]/card:px-3", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/card.tsx",
    lineNumber: 55,
    columnNumber: 9
  }, this);
}
function Skeleton({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { "data-slot": "skeleton", className: cn("bg-hover rounded-md animate-pulse", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/skeleton.tsx",
    lineNumber: 4,
    columnNumber: 9
  }, this);
}
const halo = cva("relative inline-flex shrink-0 items-center justify-center rounded-full", {
  variants: { onColor: { false: "bg-brand-purple/15", true: "bg-current/15" } },
  defaultVariants: { onColor: false }
});
const disc = cva("inline-flex items-center justify-center rounded-full", {
  variants: {
    onColor: {
      false: "bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--brand-purple),white_14%),var(--brand-purple))] text-primary-foreground",
      true: "bg-current/25 text-current"
    }
  },
  defaultVariants: { onColor: false }
});
function GradientIconBadge({ icon, onColor, className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: cn(halo({ onColor }), "size-12", className), "aria-hidden": true, ...props, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: cn(disc({ onColor }), "size-9"), children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(GradientIcon, { icon, className: "size-5" }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/gradient-icon-badge.tsx",
    lineNumber: 37,
    columnNumber: 5
  }, this) }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/gradient-icon-badge.tsx",
    lineNumber: 36,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/gradient-icon-badge.tsx",
    lineNumber: 35,
    columnNumber: 3
  }, this);
}
function Select(props) {
  if ("enum" in props && props.enum != null) {
    const {
      enum: enumObj,
      i18nPrefix,
      value,
      onValueChange,
      placeholder,
      values,
      id,
      className,
      disabled,
      "aria-invalid": ariaInvalid
    } = props;
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      SelectEnum,
      {
        enumObj,
        i18nPrefix,
        value,
        onValueChange,
        placeholder,
        values,
        id,
        className,
        disabled,
        "aria-invalid": ariaInvalid
      },
      void 0,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
        lineNumber: 56,
        columnNumber: 4
      },
      this
    );
  }
  const { children, ...rest } = props;
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectRoot, { ...rest, children }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
    lineNumber: 71,
    columnNumber: 9
  }, this);
}
function SelectEnum({
  enumObj,
  i18nPrefix,
  value,
  onValueChange,
  placeholder,
  values,
  id,
  className,
  disabled,
  "aria-invalid": ariaInvalid
}) {
  const { t } = useTranslation();
  const options = values ?? Object.values(enumObj);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    SelectRoot,
    {
      value: value ?? null,
      onValueChange: (v) => {
        if (isEnumValue(enumObj, v)) onValueChange(v);
      },
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectTrigger, { id, className, disabled, "aria-invalid": ariaInvalid, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectValue, { children: value != null ? t(`${i18nPrefix}.${value}`) : placeholder ? t(placeholder) : null }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
          lineNumber: 101,
          columnNumber: 5
        }, this) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
          lineNumber: 100,
          columnNumber: 4
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectContent, { children: options.map((v) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectItem, { value: v, children: t(`${i18nPrefix}.${v}`) }, v, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
          lineNumber: 105,
          columnNumber: 6
        }, this)) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
          lineNumber: 103,
          columnNumber: 4
        }, this)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
      lineNumber: 94,
      columnNumber: 3
    },
    this
  );
}
function SelectValue({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectValue$1, { "data-slot": "select-value", className: cn("flex flex-1 text-left", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
    lineNumber: 123,
    columnNumber: 9
  }, this);
}
function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    SelectTrigger$1,
    {
      "data-slot": "select-trigger",
      "data-size": size,
      className: cn(
        trigger,
        "cursor-pointer data-[placeholder]:text-muted-foreground focus-visible:ring-ring/30 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 gap-1.5 rounded-lg py-2 pr-2 pl-2.5 text-sm transition-all duration-200 ease-in-out select-none focus-visible:ring-2 aria-invalid:ring-2 data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-md *:data-[slot=select-value]:flex *:data-[slot=select-value]:gap-1.5 [&_svg:not([class*='size-'])]:size-4 flex w-fit items-center justify-between whitespace-nowrap outline-none disabled:cursor-not-allowed disabled:opacity-50 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      ),
      ...props,
      children: [
        children,
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectIcon, { render: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconSelector, { className: "text-muted-foreground size-4 pointer-events-none" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
          lineNumber: 146,
          columnNumber: 34
        }, this) }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
          lineNumber: 146,
          columnNumber: 4
        }, this)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
      lineNumber: 135,
      columnNumber: 3
    },
    this
  );
}
function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = false,
  ...props
}) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectPortal, { children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    SelectPositioner,
    {
      side,
      sideOffset,
      align,
      alignOffset,
      alignItemWithTrigger,
      className: "isolate z-50",
      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        SelectPopup,
        {
          "data-slot": "select-content",
          className: cn(
            trigger,
            "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-98 data-open:zoom-in-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 min-w-36 rounded-lg duration-200 ease-in-out relative isolate z-50 max-h-(--available-height) w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto supports-backdrop-filter:backdrop-blur-sm",
            className
          ),
          ...props,
          children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectScrollUpButton, {}, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
              lineNumber: 181,
              columnNumber: 6
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectList, { children }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
              lineNumber: 182,
              columnNumber: 6
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectScrollDownButton, {}, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
              lineNumber: 183,
              columnNumber: 6
            }, this)
          ]
        },
        void 0,
        true,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
          lineNumber: 172,
          columnNumber: 5
        },
        this
      )
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
      lineNumber: 164,
      columnNumber: 4
    },
    this
  ) }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
    lineNumber: 163,
    columnNumber: 3
  }, this);
}
function SelectItem({ className, children, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    SelectItem$1,
    {
      "data-slot": "select-item",
      className: cn(
        "focus:bg-hover focus:text-foreground gap-1.5 rounded-none first:rounded-t-md last:rounded-b-md py-2.25 pr-8 pl-2.25 text-sm [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2 relative flex w-full cursor-pointer items-center outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      ),
      ...props,
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SelectItemText, { className: "flex flex-1 gap-2 shrink-0 whitespace-nowrap", children }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
          lineNumber: 210,
          columnNumber: 4
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          SelectItemIndicator,
          {
            render: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "pointer-events-none absolute right-2 flex size-4 items-center justify-center" }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
              lineNumber: 212,
              columnNumber: 13
            }, this),
            children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconCheck, { className: "pointer-events-none" }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
              lineNumber: 214,
              columnNumber: 5
            }, this)
          },
          void 0,
          false,
          {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
            lineNumber: 211,
            columnNumber: 4
          },
          this
        )
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
      lineNumber: 202,
      columnNumber: 3
    },
    this
  );
}
function SelectScrollUpButton({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    SelectScrollUpArrow,
    {
      "data-slot": "select-scroll-up-button",
      className: cn(
        "bg-background z-10 flex cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4 top-0 w-full",
        className
      ),
      ...props,
      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconChevronUp, {}, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
        lineNumber: 240,
        columnNumber: 4
      }, this)
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
      lineNumber: 232,
      columnNumber: 3
    },
    this
  );
}
function SelectScrollDownButton({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    SelectScrollDownArrow,
    {
      "data-slot": "select-scroll-down-button",
      className: cn(
        "bg-background z-10 flex cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4 bottom-0 w-full",
        className
      ),
      ...props,
      children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconChevronDown, {}, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
        lineNumber: 255,
        columnNumber: 4
      }, this)
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/components/ui/select.tsx",
      lineNumber: 247,
      columnNumber: 3
    },
    this
  );
}
const preferencesSchema = object({
  language: _enum([LanguageEnum["pt-BR"], LanguageEnum["en-US"]]),
  timezone: string().min(1, { message: "REQUIRED" })
});
function PreferencesForm({ defaultValues, currency, className, ...props }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const updateProfileMutation = useUpdateProfile({
    mutation: {
      onSuccess: () => {
        toast.success(t("account.preferences.saveSuccess"));
        queryClient.invalidateQueries({ queryKey: getMyAccountQueryKey() });
      }
    }
  });
  const form = useForm({
    defaultValues,
    validators: { onChange: preferencesSchema },
    onSubmit: async ({ value }) => {
      const result = preferencesSchema.safeParse(value);
      if (!result.success) return;
      await updateProfileMutation.mutateAsync({
        data: {
          timezone: result.data.timezone,
          language: result.data.language
        }
      });
    }
  });
  return (
    // A15: forward className + native form attrs; keep form's own onSubmit last
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "form",
      {
        noValidate: true,
        className: cn(className),
        ...props,
        onSubmit: (e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        },
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldGroup, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid gap-4 sm:grid-cols-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Field, { name: "language", children: (field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
              return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { htmlFor: field.name, children: t("account.preferences.language") }, void 0, false, {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/PreferencesForm.tsx",
                  lineNumber: 90,
                  columnNumber: 10
                }, this),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  Select,
                  {
                    enum: LanguageEnum,
                    i18nPrefix: "enums.Language",
                    value: field.state.value,
                    onValueChange: field.handleChange,
                    placeholder: "account.preferences.languagePlaceholder",
                    id: field.name,
                    "aria-invalid": isInvalid
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/PreferencesForm.tsx",
                    lineNumber: 91,
                    columnNumber: 10
                  },
                  this
                )
              ] }, void 0, true, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/PreferencesForm.tsx",
                lineNumber: 89,
                columnNumber: 9
              }, this);
            } }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/PreferencesForm.tsx",
              lineNumber: 85,
              columnNumber: 6
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Field, { name: "timezone", children: (field) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { htmlFor: field.name, children: t("account.preferences.timezone") }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/PreferencesForm.tsx",
                lineNumber: 109,
                columnNumber: 9
              }, this),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                Input,
                {
                  id: field.name,
                  type: "text",
                  placeholder: "America/Sao_Paulo",
                  value: field.state.value ?? "",
                  onBlur: field.handleBlur,
                  onChange: (e) => field.handleChange(e.target.value)
                },
                void 0,
                false,
                {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/PreferencesForm.tsx",
                  lineNumber: 110,
                  columnNumber: 9
                },
                this
              )
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/PreferencesForm.tsx",
              lineNumber: 108,
              columnNumber: 8
            }, this) }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/PreferencesForm.tsx",
              lineNumber: 106,
              columnNumber: 6
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { children: t("account.preferences.currency") }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/PreferencesForm.tsx",
                lineNumber: 124,
                columnNumber: 7
              }, this),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Input, { type: "text", value: currency, disabled: true, "aria-readonly": "true", className: "opacity-60" }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/PreferencesForm.tsx",
                lineNumber: 125,
                columnNumber: 7
              }, this)
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/PreferencesForm.tsx",
              lineNumber: 123,
              columnNumber: 6
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/PreferencesForm.tsx",
            lineNumber: 83,
            columnNumber: 5
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Subscribe, { selector: (s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting, values: s.values }), children: ({ canSubmit, isSubmitting, values }) => {
            const isPending = isSubmitting || updateProfileMutation.isPending;
            const isDisabled = !canSubmit || isPending || !preferencesSchema.safeParse(values).success;
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-end", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { type: "submit", disabled: isDisabled, children: [
              isPending && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Spinner, { className: "mr-2" }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/PreferencesForm.tsx",
                lineNumber: 137,
                columnNumber: 24
              }, this),
              t("account.preferences.save")
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/PreferencesForm.tsx",
              lineNumber: 136,
              columnNumber: 9
            }, this) }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/PreferencesForm.tsx",
              lineNumber: 135,
              columnNumber: 8
            }, this);
          } }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/PreferencesForm.tsx",
            lineNumber: 130,
            columnNumber: 5
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/PreferencesForm.tsx",
          lineNumber: 82,
          columnNumber: 4
        }, this)
      },
      void 0,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/PreferencesForm.tsx",
        lineNumber: 72,
        columnNumber: 3
      },
      this
    )
  );
}
function PreferencesSection({ className, ...props }) {
  const { t } = useTranslation();
  const { data, isPending, isError } = useGetMyAccount();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { className: cn("gap-0 p-0", className), ...props, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardHeader, { className: "flex flex-row items-center gap-3 border-b border-border/60 px-5 py-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(GradientIconBadge, { icon: BellIcon }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/index.tsx",
        lineNumber: 24,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex min-w-0 flex-col gap-0.5", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardTitle, { className: "text-sm font-semibold text-foreground", children: t("account.preferences.sectionTitle") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/index.tsx",
          lineNumber: 26,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardDescription, { className: "text-xs", children: t("account.preferences.sectionDescription") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/index.tsx",
          lineNumber: 27,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/index.tsx",
        lineNumber: 25,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/index.tsx",
      lineNumber: 23,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardContent, { className: "px-5 py-6", children: isPending ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid gap-4 sm:grid-cols-2", children: Array.from({ length: 3 }).map((_, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1.5", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-4 w-20 rounded" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/index.tsx",
          lineNumber: 37,
          columnNumber: 10
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-8 w-full rounded-lg" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/index.tsx",
          lineNumber: 38,
          columnNumber: 10
        }, this)
      ] }, i, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/index.tsx",
        lineNumber: 36,
        columnNumber: 9
      }, this)) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/index.tsx",
        lineNumber: 34,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-14 w-full rounded-xl" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/index.tsx",
        lineNumber: 42,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/index.tsx",
      lineNumber: 33,
      columnNumber: 6
    }, this) : isError || !data ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-muted-foreground", children: t("account.preferences.loadError") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/index.tsx",
      lineNumber: 45,
      columnNumber: 6
    }, this) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      PreferencesForm,
      {
        defaultValues: {
          language: data.preferences.language,
          timezone: data.preferences.timezone
        },
        currency: data.preferences.currency
      },
      void 0,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/index.tsx",
        lineNumber: 47,
        columnNumber: 6
      },
      this
    ) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/index.tsx",
      lineNumber: 31,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/PreferencesSection/index.tsx",
    lineNumber: 22,
    columnNumber: 3
  }, this);
}
function AvatarUploader({ value, onUpload, onRemove, fallbackInitials, className, ...props }) {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = reactExports.useState(null);
  const fileInputRef = reactExports.useRef(null);
  const displayUrl = previewUrl ?? value;
  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    onUpload(file);
  }
  function handleRemove() {
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onRemove();
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: cn("flex items-center gap-4", className), ...props, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Avatar, { size: "lg", className: "size-16", children: [
      displayUrl ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AvatarImage, { src: displayUrl, alt: fallbackInitials }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/AvatarUploader/index.tsx",
        lineNumber: 50,
        columnNumber: 19
      }, this) : null,
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AvatarFallback, { className: "text-base", children: fallbackInitials }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/AvatarUploader/index.tsx",
        lineNumber: 51,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/AvatarUploader/index.tsx",
      lineNumber: 49,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "input",
        {
          ref: fileInputRef,
          type: "file",
          accept: "image/*",
          className: "sr-only",
          "aria-label": t("account.profile.avatar.uploadAriaLabel"),
          onChange: handleFileChange
        },
        void 0,
        false,
        {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/AvatarUploader/index.tsx",
          lineNumber: 55,
          columnNumber: 5
        },
        this
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { type: "button", variant: "secondary", size: "sm", onClick: () => fileInputRef.current?.click(), children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconUpload, { className: "size-3.5" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/AvatarUploader/index.tsx",
          lineNumber: 64,
          columnNumber: 6
        }, this),
        t("account.profile.avatar.upload")
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/AvatarUploader/index.tsx",
        lineNumber: 63,
        columnNumber: 5
      }, this),
      displayUrl ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { type: "button", variant: "ghost", size: "sm", className: "text-destructive hover:text-destructive", onClick: handleRemove, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconTrash, { className: "size-3.5" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/AvatarUploader/index.tsx",
          lineNumber: 69,
          columnNumber: 7
        }, this),
        t("account.profile.avatar.remove")
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/AvatarUploader/index.tsx",
        lineNumber: 68,
        columnNumber: 6
      }, this) : null
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/AvatarUploader/index.tsx",
      lineNumber: 54,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/AvatarUploader/index.tsx",
    lineNumber: 48,
    columnNumber: 3
  }, this);
}
function ProfileForm({ defaultValues, fallbackInitials, className, ...props }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const updateProfileMutation = useUpdateProfile({
    mutation: {
      onSuccess: () => {
        toast.success(t("account.profile.saveSuccess"));
        queryClient.invalidateQueries({ queryKey: getMyAccountQueryKey() });
      }
    }
  });
  const formDefaults = {
    name: defaultValues.name,
    pictureUrl: defaultValues.pictureUrl
  };
  const form = useForm({
    defaultValues: formDefaults,
    validators: { onChange: updateProfileMutationRequestSchema },
    onSubmit: async ({ value }) => {
      const result = updateProfileMutationRequestSchema.safeParse(value);
      if (!result.success) return;
      await updateProfileMutation.mutateAsync({ data: result.data });
    }
  });
  return (
    // A15: forward className + native form attrs; keep form's onSubmit last
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "form",
      {
        noValidate: true,
        className: cn(className),
        ...props,
        onSubmit: (e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        },
        children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldGroup, { children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Field, { name: "pictureUrl", children: (field) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            AvatarUploader,
            {
              value: field.state.value ?? null,
              fallbackInitials,
              onUpload: () => {
                toast.info(t("account.profile.avatar.uploadStub"));
              },
              onRemove: () => field.handleChange(null)
            },
            void 0,
            false,
            {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
              lineNumber: 83,
              columnNumber: 7
            },
            this
          ) }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
            lineNumber: 81,
            columnNumber: 5
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid gap-4 sm:grid-cols-2", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Field, { name: "name", children: (field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
              return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { htmlFor: field.name, children: t("account.profile.name") }, void 0, false, {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
                  lineNumber: 103,
                  columnNumber: 10
                }, this),
                /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                  Input,
                  {
                    id: field.name,
                    type: "text",
                    autoComplete: "name",
                    value: field.state.value ?? "",
                    onBlur: field.handleBlur,
                    onChange: (e) => field.handleChange(e.target.value),
                    "aria-invalid": isInvalid
                  },
                  void 0,
                  false,
                  {
                    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
                    lineNumber: 104,
                    columnNumber: 10
                  },
                  this
                ),
                isInvalid && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldError, { errors: field.state.meta.errors }, void 0, false, {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
                  lineNumber: 113,
                  columnNumber: 24
                }, this)
              ] }, void 0, true, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
                lineNumber: 102,
                columnNumber: 9
              }, this);
            } }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
              lineNumber: 98,
              columnNumber: 6
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { children: t("account.profile.email") }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
                lineNumber: 121,
                columnNumber: 7
              }, this),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Input, { type: "email", autoComplete: "email", value: defaultValues.email, disabled: true, "aria-readonly": "true", className: "opacity-60" }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
                lineNumber: 122,
                columnNumber: 7
              }, this)
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
              lineNumber: 120,
              columnNumber: 6
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { children: t("account.profile.company") }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
                lineNumber: 127,
                columnNumber: 7
              }, this),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                Input,
                {
                  type: "text",
                  autoComplete: "organization",
                  value: defaultValues.company ?? "",
                  disabled: true,
                  "aria-readonly": "true",
                  className: "opacity-60"
                },
                void 0,
                false,
                {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
                  lineNumber: 128,
                  columnNumber: 7
                },
                this
              )
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
              lineNumber: 126,
              columnNumber: 6
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
            lineNumber: 96,
            columnNumber: 5
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Subscribe, { selector: (s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting, values: s.values }), children: ({ canSubmit, isSubmitting, values }) => {
            const isPending = isSubmitting || updateProfileMutation.isPending;
            const isDisabled = !canSubmit || isPending || !updateProfileMutationRequestSchema.safeParse(values).success;
            return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex justify-end", children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { type: "submit", disabled: isDisabled, children: [
              isPending && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Spinner, { className: "mr-2" }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
                lineNumber: 147,
                columnNumber: 24
              }, this),
              t("account.profile.save")
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
              lineNumber: 146,
              columnNumber: 9
            }, this) }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
              lineNumber: 145,
              columnNumber: 8
            }, this);
          } }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
            lineNumber: 140,
            columnNumber: 5
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
          lineNumber: 79,
          columnNumber: 4
        }, this)
      },
      void 0,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/ProfileForm.tsx",
        lineNumber: 69,
        columnNumber: 3
      },
      this
    )
  );
}
function ProfileFormSection({ className, ...props }) {
  const { t } = useTranslation();
  const { data, isPending, isError } = useGetMyAccount();
  const fallbackInitials = data?.profile.name ? data.profile.name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() : "?";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { className: cn("gap-0 p-0", className), ...props, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardHeader, { className: "flex flex-row items-center gap-3 border-b border-border/60 px-5 py-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(GradientIconBadge, { icon: UserIcon }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/index.tsx",
        lineNumber: 34,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex min-w-0 flex-col gap-0.5", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardTitle, { className: "text-sm font-semibold text-foreground", children: t("account.profile.sectionTitle") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/index.tsx",
          lineNumber: 36,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardDescription, { className: "text-xs", children: t("account.profile.sectionDescription") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/index.tsx",
          lineNumber: 37,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/index.tsx",
        lineNumber: 35,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/index.tsx",
      lineNumber: 33,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardContent, { className: "px-5 py-6", children: isPending ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "size-16 rounded-full" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/index.tsx",
          lineNumber: 45,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-8 w-24 rounded-lg" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/index.tsx",
            lineNumber: 47,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-8 w-20 rounded-lg" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/index.tsx",
            lineNumber: 48,
            columnNumber: 9
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/index.tsx",
          lineNumber: 46,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/index.tsx",
        lineNumber: 44,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "grid gap-4 sm:grid-cols-2", children: Array.from({ length: 3 }).map((_, i) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-1.5", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-4 w-16 rounded" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/index.tsx",
          lineNumber: 54,
          columnNumber: 10
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-8 w-full rounded-lg" }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/index.tsx",
          lineNumber: 55,
          columnNumber: 10
        }, this)
      ] }, i, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/index.tsx",
        lineNumber: 53,
        columnNumber: 9
      }, this)) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/index.tsx",
        lineNumber: 51,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/index.tsx",
      lineNumber: 43,
      columnNumber: 6
    }, this) : isError || !data ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-muted-foreground", children: t("account.profile.loadError") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/index.tsx",
      lineNumber: 61,
      columnNumber: 6
    }, this) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      ProfileForm,
      {
        defaultValues: {
          name: data.profile.name,
          email: data.profile.email,
          company: data.profile.company,
          pictureUrl: data.profile.pictureUrl
        },
        fallbackInitials
      },
      void 0,
      false,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/index.tsx",
        lineNumber: 63,
        columnNumber: 6
      },
      this
    ) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/index.tsx",
      lineNumber: 41,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/ProfileFormSection/index.tsx",
    lineNumber: 32,
    columnNumber: 3
  }, this);
}
const changePasswordSchema = object({
  currentPassword: string().min(1, { message: "REQUIRED" }),
  newPassword: string().min(8, { message: "PASSWORD_TOO_SHORT" }),
  confirmPassword: string().min(1, { message: "REQUIRED" })
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "PASSWORDS_DO_NOT_MATCH",
  path: ["confirmPassword"]
});
function ChangePasswordDialog() {
  const { t } = useTranslation();
  const hide = useDialogStore((s) => s.hide);
  const form = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: ""
    },
    validators: { onChange: changePasswordSchema },
    onSubmit: async () => {
      toast.info(t("account.security.changePassword.stub"));
      hide();
    }
  });
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogContent, { children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogHeader, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogTitle, { children: t("account.security.changePassword.dialogTitle") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
        lineNumber: 51,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogDescription, { children: t("account.security.changePassword.dialogDescription") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
        lineNumber: 52,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
      lineNumber: 50,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "form",
      {
        noValidate: true,
        onSubmit: (e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        },
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldGroup, { children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Field, { name: "currentPassword", children: (field) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { htmlFor: field.name, children: t("account.security.changePassword.currentPassword") }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
                lineNumber: 67,
                columnNumber: 9
              }, this),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                Input,
                {
                  id: field.name,
                  type: "password",
                  autoComplete: "current-password",
                  value: field.state.value,
                  onBlur: field.handleBlur,
                  onChange: (e) => field.handleChange(e.target.value)
                },
                void 0,
                false,
                {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
                  lineNumber: 68,
                  columnNumber: 9
                },
                this
              ),
              field.state.meta.errors[0] && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldError, { children: String(field.state.meta.errors[0]?.message ?? "") }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
                lineNumber: 76,
                columnNumber: 40
              }, this)
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
              lineNumber: 66,
              columnNumber: 8
            }, this) }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
              lineNumber: 64,
              columnNumber: 6
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Field, { name: "newPassword", children: (field) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { htmlFor: field.name, children: t("account.security.changePassword.newPassword") }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
                lineNumber: 84,
                columnNumber: 9
              }, this),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                Input,
                {
                  id: field.name,
                  type: "password",
                  autoComplete: "new-password",
                  value: field.state.value,
                  onBlur: field.handleBlur,
                  onChange: (e) => field.handleChange(e.target.value)
                },
                void 0,
                false,
                {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
                  lineNumber: 85,
                  columnNumber: 9
                },
                this
              ),
              field.state.meta.errors[0] && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldError, { children: String(field.state.meta.errors[0]?.message ?? "") }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
                lineNumber: 93,
                columnNumber: 40
              }, this)
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
              lineNumber: 83,
              columnNumber: 8
            }, this) }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
              lineNumber: 81,
              columnNumber: 6
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Field, { name: "confirmPassword", children: (field) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { htmlFor: field.name, children: t("account.security.changePassword.confirmPassword") }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
                lineNumber: 101,
                columnNumber: 9
              }, this),
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
                Input,
                {
                  id: field.name,
                  type: "password",
                  autoComplete: "new-password",
                  value: field.state.value,
                  onBlur: field.handleBlur,
                  onChange: (e) => field.handleChange(e.target.value)
                },
                void 0,
                false,
                {
                  fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
                  lineNumber: 102,
                  columnNumber: 9
                },
                this
              ),
              field.state.meta.errors[0] && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldError, { children: String(field.state.meta.errors[0]?.message ?? "") }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
                lineNumber: 110,
                columnNumber: 40
              }, this)
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
              lineNumber: 100,
              columnNumber: 8
            }, this) }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
              lineNumber: 98,
              columnNumber: 6
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
            lineNumber: 63,
            columnNumber: 5
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogFooter, { className: "mt-4", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { type: "button", variant: "outline", onClick: hide, children: t("account.security.changePassword.cancel") }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
              lineNumber: 117,
              columnNumber: 6
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Subscribe, { selector: (s) => [s.canSubmit, s.isSubmitting], children: ([canSubmit, isSubmitting]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { type: "submit", disabled: !canSubmit, children: [
              isSubmitting ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Spinner, { className: "mr-2" }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
                lineNumber: 123,
                columnNumber: 25
              }, this) : null,
              t("account.security.changePassword.submit")
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
              lineNumber: 122,
              columnNumber: 8
            }, this) }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
              lineNumber: 120,
              columnNumber: 6
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
            lineNumber: 116,
            columnNumber: 5
          }, this)
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
        lineNumber: 55,
        columnNumber: 4
      },
      this
    )
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
    lineNumber: 49,
    columnNumber: 3
  }, this);
}
function SecuritySection({ className, ...props }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { data, isPending, isError } = useGetMyAccount();
  const { show, confirm } = useDialogStore();
  async function handleDeleteAccount() {
    const ok = await confirm({
      title: t("account.security.deleteAccount.confirmTitle"),
      description: t("account.security.deleteAccount.confirmDescription"),
      actionLabel: t("account.security.deleteAccount.confirmAction"),
      cancelLabel: t("account.security.deleteAccount.confirmCancel"),
      variant: "destructive"
    });
    if (ok) {
      toast.info(t("account.security.deleteAccount.stub"));
    }
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Card, { className: cn("gap-0 p-0", className), ...props, children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardHeader, { className: "flex flex-row items-center gap-3 border-b border-border/60 px-5 py-4", children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(GradientIconBadge, { icon: LockIcon }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 47,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex min-w-0 flex-col gap-0.5", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardTitle, { className: "text-sm font-semibold text-foreground", children: t("account.security.sectionTitle") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
          lineNumber: 49,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardDescription, { className: "text-xs", children: t("account.security.sectionDescription") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
          lineNumber: 50,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 48,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
      lineNumber: 46,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardContent, { className: "flex flex-col gap-4 px-5 py-6", children: isPending ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-10 w-48 rounded-lg" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 57,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-px w-full" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 58,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-10 w-40 rounded-lg" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 59,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
      lineNumber: 56,
      columnNumber: 6
    }, this) : isError || !data ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-muted-foreground", children: t("account.security.loadError") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
      lineNumber: 62,
      columnNumber: 6
    }, this) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 text-sm", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconShieldCheck, { className: cn("size-4", data.security.twoFactorEnabled ? "text-success" : "text-muted-foreground") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
          lineNumber: 67,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: cn("font-medium", data.security.twoFactorEnabled ? "text-success" : "text-muted-foreground"), children: data.security.twoFactorEnabled ? t("account.security.twoFactor.enabled") : t("account.security.twoFactor.disabled") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
          lineNumber: 68,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 66,
        columnNumber: 7
      }, this),
      data.security.lastPasswordChangeAt ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-xs text-muted-foreground", children: t("account.security.lastPasswordChange", {
        date: new Intl.DateTimeFormat(locale, {
          year: "numeric",
          month: "short",
          day: "numeric"
        }).format(new Date(data.security.lastPasswordChangeAt))
      }) }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 75,
        columnNumber: 8
      }, this) : null,
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border-t border-border/60" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 86,
        columnNumber: 7
      }, this),
      data.security.hasPassword ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-0.5", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm font-medium text-foreground", children: t("account.security.changePassword.label") }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
            lineNumber: 92,
            columnNumber: 10
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-muted-foreground", children: t("account.security.changePassword.description") }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
            lineNumber: 93,
            columnNumber: 10
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
          lineNumber: 91,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "secondary", size: "sm", onClick: () => show(/* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChangePasswordDialog, {}, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
          lineNumber: 95,
          columnNumber: 67
        }, this)), children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconKey, { className: "size-3.5" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
            lineNumber: 96,
            columnNumber: 10
          }, this),
          t("account.security.changePassword.button")
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
          lineNumber: 95,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 90,
        columnNumber: 8
      }, this) : null,
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border-t border-border/60" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 102,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-0.5", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm font-medium text-destructive", children: t("account.security.deleteAccount.label") }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
            lineNumber: 107,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-muted-foreground", children: t("account.security.deleteAccount.description") }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
            lineNumber: 108,
            columnNumber: 9
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
          lineNumber: 106,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "destructive", size: "sm", onClick: handleDeleteAccount, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconTrash, { className: "size-3.5" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
            lineNumber: 111,
            columnNumber: 9
          }, this),
          t("account.security.deleteAccount.button")
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
          lineNumber: 110,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 105,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
      lineNumber: 64,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
      lineNumber: 54,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
    lineNumber: 45,
    columnNumber: 3
  }, this);
}
function RouteComponent() {
  const {
    t
  } = useTranslation();
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-1 flex-col gap-6 overflow-y-auto p-6 md:p-8", children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(AccountHeaderSection, { title: t("account.header.title") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/index.tsx?tsr-split=component",
      lineNumber: 11,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ProfileFormSection, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/index.tsx?tsr-split=component",
      lineNumber: 12,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(PreferencesSection, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/index.tsx?tsr-split=component",
      lineNumber: 13,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SecuritySection, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/index.tsx?tsr-split=component",
      lineNumber: 14,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/app/react/src/routes/(app)/settings/account/index.tsx?tsr-split=component",
    lineNumber: 10,
    columnNumber: 10
  }, this);
}
export {
  RouteComponent as component
};

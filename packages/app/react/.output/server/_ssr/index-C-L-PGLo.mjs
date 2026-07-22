import { c as jsxDevRuntimeExports, r as reactExports } from "../_libs/react.mjs";
import { c as cn, B as Button, s as surface, d as translateError, b as createClient } from "./router-CPODl6Uk.mjs";
import { u as useQuery, q as queryOptions } from "../_libs/tanstack__react-query.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { c as cva } from "../_libs/class-variance-authority.mjs";
import { u as useDialogStore, L as LockIcon, G as GradientIcon, a as DialogContent, b as DialogHeader, c as DialogTitle, d as DialogDescription, e as DialogFooter, S as Spinner } from "./useDialogStore-CufGMHV1.mjs";
import { u as useForm } from "../_libs/tanstack__react-form.mjs";
import "../_libs/i18next.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { b as IconShieldCheck, c as IconKey, d as IconTrash } from "../_libs/tabler__icons-react.mjs";
import { I as Input$1 } from "../_libs/base-ui__react.mjs";
import { o as object, s as string } from "../_libs/zod.mjs";
import "../_libs/ky.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/tanstack__react-router.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
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
import "../_libs/tailwind-merge.mjs";
import "../_libs/tanstack__react-query-devtools.mjs";
import "../_libs/@tanstack/react-router-devtools+[...].mjs";
import "../_libs/zustand.mjs";
import "../_libs/tanstack__form-core.mjs";
import "../_libs/tanstack__store.mjs";
import "../_libs/tanstack__pacer-lite.mjs";
import "../_libs/@tanstack/devtools-event-client+[...].mjs";
import "../_libs/tanstack__react-store.mjs";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/base-ui__utils.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/floating-ui__react-dom.mjs";
import "../_libs/floating-ui__dom.mjs";
import "../_libs/floating-ui__core.mjs";
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
function useLocale() {
  const { i18n } = useTranslation();
  return i18n.language?.startsWith("en") ? "en-US" : "pt-BR";
}
function AccountHeaderSection({ title, className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: cn("flex flex-col gap-1", className), ...props, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("h1", { className: "text-2xl font-bold text-foreground", children: title }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/AccountHeaderSection/index.tsx",
    lineNumber: 15,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/AccountHeaderSection/index.tsx",
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
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/card.tsx",
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
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/card.tsx",
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
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/card.tsx",
      lineNumber: 36,
      columnNumber: 3
    },
    this
  );
}
function CardDescription({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { "data-slot": "card-description", className: cn("text-muted-foreground text-sm", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/card.tsx",
    lineNumber: 45,
    columnNumber: 9
  }, this);
}
function CardContent({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { "data-slot": "card-content", className: cn("px-4 group-data-[size=sm]/card:px-3", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/card.tsx",
    lineNumber: 55,
    columnNumber: 9
  }, this);
}
function Skeleton({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { "data-slot": "skeleton", className: cn("bg-hover rounded-md animate-pulse", className), ...props }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/skeleton.tsx",
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
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/gradient-icon-badge.tsx",
    lineNumber: 37,
    columnNumber: 5
  }, this) }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/gradient-icon-badge.tsx",
    lineNumber: 36,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/gradient-icon-badge.tsx",
    lineNumber: 35,
    columnNumber: 3
  }, this);
}
function Label({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "label",
    {
      "data-slot": "label",
      className: cn(
        "gap-2 text-sm leading-none font-medium group-data-[disabled=true]:opacity-50 peer-disabled:opacity-50 flex items-center select-none group-data-[disabled=true]:pointer-events-none peer-disabled:cursor-not-allowed",
        className
      ),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/label.tsx",
      lineNumber: 9,
      columnNumber: 3
    },
    this
  );
}
function FieldGroup({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      "data-slot": "field-group",
      className: cn(
        "gap-5 data-[slot=checkbox-group]:gap-3 [&>[data-slot=field-group]]:gap-4 group/field-group @container/field-group flex w-full flex-col",
        className
      ),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/field.tsx",
      lineNumber: 31,
      columnNumber: 3
    },
    this
  );
}
const fieldVariants = cva("data-[invalid=true]:text-destructive gap-2 group/field flex w-full", {
  variants: {
    orientation: {
      vertical: "flex-col [&>*]:w-full [&>.sr-only]:w-auto",
      horizontal: "flex-row items-center [&>[data-slot=field-label]]:flex-auto has-[>[data-slot=field-content]]:items-start has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      responsive: "flex-col [&>*]:w-full [&>.sr-only]:w-auto @md/field-group:flex-row @md/field-group:items-center @md/field-group:[&>*]:w-auto @md/field-group:[&>[data-slot=field-label]]:flex-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px"
    }
  },
  defaultVariants: {
    orientation: "vertical"
  }
});
function Field({ className, orientation = "vertical", ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      role: "group",
      "data-slot": "field",
      "data-orientation": orientation,
      className: cn(fieldVariants({ orientation }), className),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/field.tsx",
      lineNumber: 59,
      columnNumber: 3
    },
    this
  );
}
function FieldLabel({ className, ...props }) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    Label,
    {
      "data-slot": "field-label",
      className: cn(
        "has-data-checked:bg-primary/5 has-data-checked:border-primary dark:has-data-checked:bg-primary/10 gap-2 group-data-[disabled=true]/field:opacity-50 has-[>[data-slot=field]]:rounded-lg has-[>[data-slot=field]]:border [&>*]:data-[slot=field]:p-2.5 group/field-label peer/field-label flex w-fit leading-snug",
        "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col",
        className
      ),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/field.tsx",
      lineNumber: 77,
      columnNumber: 3
    },
    this
  );
}
function translateErrorMessage(message) {
  if (!message) return message;
  return translateError(message);
}
function FieldError({
  className,
  children,
  errors,
  ...props
}) {
  const content = reactExports.useMemo(() => {
    if (children) {
      return children;
    }
    if (!errors?.length) {
      return null;
    }
    const translatedErrors = errors.map((error) => {
      if (typeof error === "string") return { message: translateErrorMessage(error) };
      return {
        ...error,
        message: translateErrorMessage(error?.message)
      };
    });
    const uniqueErrors = [...new Map(translatedErrors.map((error) => [error?.message, error])).values()];
    if (uniqueErrors?.length === 1) {
      return uniqueErrors[0]?.message;
    }
    return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("ul", { className: "ml-4 flex list-disc flex-col gap-1", children: uniqueErrors.map((error, index) => error?.message && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("li", { children: error.message }, index, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/field.tsx",
      lineNumber: 182,
      columnNumber: 59
    }, this)) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/field.tsx",
      lineNumber: 181,
      columnNumber: 4
    }, this);
  }, [children, errors]);
  if (!content) {
    return null;
  }
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { role: "alert", "data-slot": "field-error", className: cn("text-destructive text-sm font-normal", className), ...props, children: content }, void 0, false, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/field.tsx",
    lineNumber: 192,
    columnNumber: 3
  }, this);
}
const inputBg = "gradient-bg-[var(--background)_-85%,color-mix(in_oklab,var(--background),var(--foreground)_10%)_110%]";
const inputBorder = "gradient-border-[oklch(from_var(--border)_l_c_h_/_0.15)_0%,oklch(from_var(--border)_l_c_h_/_0)_60%]";
const inputBorderFocus = "focus:gradient-border-[oklch(from_var(--border)_l_c_h_/_0.15)_0%,oklch(from_var(--border)_l_c_h_/_0.05)_100%]";
const Input = reactExports.forwardRef(function Input2({ className, type, ...props }, ref) {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    Input$1,
    {
      ref,
      type,
      "data-slot": "input",
      className: cn(
        "gradient-box",
        inputBg,
        inputBorder,
        inputBorderFocus,
        // Smooth hover: the gradient-border swap can't tween (--tw-gradient-border is syntax:"*"),
        // so animate a brightness lift instead — same trick the Button uses.
        "transition-[filter] duration-200 ease-in-out hover:brightness-125",
        "rounded-lg px-2.5 py-1 text-sm placeholder:text-muted-foreground",
        "h-8 w-full min-w-0 outline-none",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:ring-0",
        className
      ),
      ...props
    },
    void 0,
    false,
    {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/components/ui/input.tsx",
      lineNumber: 14,
      columnNumber: 3
    },
    this
  );
});
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
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
        lineNumber: 51,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogDescription, { children: t("account.security.changePassword.dialogDescription") }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
        lineNumber: 52,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
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
                fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
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
                  fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
                  lineNumber: 68,
                  columnNumber: 9
                },
                this
              ),
              field.state.meta.errors[0] && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldError, { children: String(field.state.meta.errors[0]?.message ?? "") }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
                lineNumber: 76,
                columnNumber: 40
              }, this)
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
              lineNumber: 66,
              columnNumber: 8
            }, this) }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
              lineNumber: 64,
              columnNumber: 6
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Field, { name: "newPassword", children: (field) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { htmlFor: field.name, children: t("account.security.changePassword.newPassword") }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
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
                  fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
                  lineNumber: 85,
                  columnNumber: 9
                },
                this
              ),
              field.state.meta.errors[0] && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldError, { children: String(field.state.meta.errors[0]?.message ?? "") }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
                lineNumber: 93,
                columnNumber: 40
              }, this)
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
              lineNumber: 83,
              columnNumber: 8
            }, this) }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
              lineNumber: 81,
              columnNumber: 6
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Field, { name: "confirmPassword", children: (field) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Field, { children: [
              /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldLabel, { htmlFor: field.name, children: t("account.security.changePassword.confirmPassword") }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
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
                  fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
                  lineNumber: 102,
                  columnNumber: 9
                },
                this
              ),
              field.state.meta.errors[0] && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(FieldError, { children: String(field.state.meta.errors[0]?.message ?? "") }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
                lineNumber: 110,
                columnNumber: 40
              }, this)
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
              lineNumber: 100,
              columnNumber: 8
            }, this) }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
              lineNumber: 98,
              columnNumber: 6
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
            lineNumber: 63,
            columnNumber: 5
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DialogFooter, { className: "mt-4", children: [
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { type: "button", variant: "outline", onClick: hide, children: t("account.security.changePassword.cancel") }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
              lineNumber: 117,
              columnNumber: 6
            }, this),
            /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(form.Subscribe, { selector: (s) => [s.canSubmit, s.isSubmitting], children: ([canSubmit, isSubmitting]) => /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { type: "submit", disabled: !canSubmit, children: [
              isSubmitting ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Spinner, { className: "mr-2" }, void 0, false, {
                fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
                lineNumber: 123,
                columnNumber: 25
              }, this) : null,
              t("account.security.changePassword.submit")
            ] }, void 0, true, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
              lineNumber: 122,
              columnNumber: 8
            }, this) }, void 0, false, {
              fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
              lineNumber: 120,
              columnNumber: 6
            }, this)
          ] }, void 0, true, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
            lineNumber: 116,
            columnNumber: 5
          }, this)
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
        lineNumber: 55,
        columnNumber: 4
      },
      this
    )
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/ChangePasswordDialog.tsx",
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
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 47,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex min-w-0 flex-col gap-0.5", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardTitle, { className: "text-sm font-semibold text-foreground", children: t("account.security.sectionTitle") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
          lineNumber: 49,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardDescription, { className: "text-xs", children: t("account.security.sectionDescription") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
          lineNumber: 50,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 48,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
      lineNumber: 46,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CardContent, { className: "flex flex-col gap-4 px-5 py-6", children: isPending ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-10 w-48 rounded-lg" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 57,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-px w-full" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 58,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Skeleton, { className: "h-10 w-40 rounded-lg" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 59,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
      lineNumber: 56,
      columnNumber: 6
    }, this) : isError || !data ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("p", { className: "text-sm text-muted-foreground", children: t("account.security.loadError") }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
      lineNumber: 62,
      columnNumber: 6
    }, this) : /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center gap-2 text-sm", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconShieldCheck, { className: cn("size-4", data.security.twoFactorEnabled ? "text-success" : "text-muted-foreground") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
          lineNumber: 67,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: cn("font-medium", data.security.twoFactorEnabled ? "text-success" : "text-muted-foreground"), children: data.security.twoFactorEnabled ? t("account.security.twoFactor.enabled") : t("account.security.twoFactor.disabled") }, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
          lineNumber: 68,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
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
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 75,
        columnNumber: 8
      }, this) : null,
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border-t border-border/60" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 86,
        columnNumber: 7
      }, this),
      data.security.hasPassword ? /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-0.5", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm font-medium text-foreground", children: t("account.security.changePassword.label") }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
            lineNumber: 92,
            columnNumber: 10
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-muted-foreground", children: t("account.security.changePassword.description") }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
            lineNumber: 93,
            columnNumber: 10
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
          lineNumber: 91,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "secondary", size: "sm", onClick: () => show(/* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(ChangePasswordDialog, {}, void 0, false, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
          lineNumber: 95,
          columnNumber: 67
        }, this)), children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconKey, { className: "size-3.5" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
            lineNumber: 96,
            columnNumber: 10
          }, this),
          t("account.security.changePassword.button")
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
          lineNumber: 95,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 90,
        columnNumber: 8
      }, this) : null,
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "border-t border-border/60" }, void 0, false, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 102,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex flex-col gap-0.5", children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-sm font-medium text-destructive", children: t("account.security.deleteAccount.label") }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
            lineNumber: 107,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("span", { className: "text-xs text-muted-foreground", children: t("account.security.deleteAccount.description") }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
            lineNumber: 108,
            columnNumber: 9
          }, this)
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
          lineNumber: 106,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(Button, { variant: "destructive", size: "sm", onClick: handleDeleteAccount, children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(IconTrash, { className: "size-3.5" }, void 0, false, {
            fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
            lineNumber: 111,
            columnNumber: 9
          }, this),
          t("account.security.deleteAccount.button")
        ] }, void 0, true, {
          fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
          lineNumber: 110,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
        lineNumber: 105,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
      lineNumber: 64,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
      lineNumber: 54,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/-components/SecuritySection/index.tsx",
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
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/index.tsx?tsr-split=component",
      lineNumber: 9,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(SecuritySection, {}, void 0, false, {
      fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/index.tsx?tsr-split=component",
      lineNumber: 10,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "/Users/work/Desktop/Projetos/pessoal/codedm/packages/app/react/src/routes/(app)/settings/account/index.tsx?tsr-split=component",
    lineNumber: 8,
    columnNumber: 10
  }, this);
}
export {
  RouteComponent as component
};

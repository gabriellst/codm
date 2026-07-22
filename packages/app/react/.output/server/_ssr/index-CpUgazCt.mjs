import { j as jsxRuntimeExports, r as reactExports } from "../_libs/react.mjs";
import { c as cn, B as Button, s as surface, u as updateProfileMutationRequestSchema, d as translateError, e as trigger, b as createClient } from "./router-DnXXQnj2.mjs";
import { u as useQuery, a as useQueryClient, q as queryOptions, b as useMutation, m as mutationOptions } from "../_libs/tanstack__react-query.mjs";
import { c as cva } from "../_libs/class-variance-authority.mjs";
import { U as UserIcon, c as BellIcon, u as useDialogStore, L as LockIcon, G as GradientIcon, S as Spinner, d as DialogContent, e as DialogHeader, f as DialogTitle, g as DialogDescription, h as DialogFooter, A as Avatar, a as AvatarImage, b as AvatarFallback } from "./useDialogStore-QmHyYQ7t.mjs";
import { u as useForm } from "../_libs/tanstack__react-form.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import "../_libs/i18next.mjs";
import { u as useTranslation } from "../_libs/react-i18next.mjs";
import { b as IconShieldCheck, c as IconKey, d as IconTrash, e as IconUpload, f as IconSelector, g as IconCheck, h as IconChevronUp, i as IconChevronDown } from "../_libs/tabler__icons-react.mjs";
import { I as Input$1, S as SelectRoot, e as SelectTrigger$1, f as SelectIcon, g as SelectValue$1, h as SelectPortal, i as SelectPositioner, j as SelectPopup, k as SelectList, l as SelectItem$1, n as SelectItemText, o as SelectItemIndicator, p as SelectScrollUpArrow, q as SelectScrollDownArrow } from "../_libs/base-ui__react.mjs";
import { o as object, s as string, _ as _enum } from "../_libs/zod.mjs";
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
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cn("flex flex-col gap-1", className), ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-2xl font-bold text-foreground", children: title }) });
}
function Card({ className, size = "default", ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
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
    }
  );
}
function CardHeader({ className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      "data-slot": "card-header",
      className: cn(
        "gap-1 rounded-t-xl px-4 group-data-[size=sm]/card:px-3 [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3 group/card-header @container/card-header grid auto-rows-min items-start has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]",
        className
      ),
      ...props
    }
  );
}
function CardTitle({ className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      "data-slot": "card-title",
      className: cn("text-base leading-snug font-medium group-data-[size=sm]/card:text-sm", className),
      ...props
    }
  );
}
function CardDescription({ className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { "data-slot": "card-description", className: cn("text-muted-foreground text-sm", className), ...props });
}
function CardContent({ className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { "data-slot": "card-content", className: cn("px-4 group-data-[size=sm]/card:px-3", className), ...props });
}
function Skeleton({ className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { "data-slot": "skeleton", className: cn("bg-hover rounded-md animate-pulse", className), ...props });
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
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: cn(halo({ onColor }), "size-12", className), "aria-hidden": true, ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: cn(disc({ onColor }), "size-9"), children: /* @__PURE__ */ jsxRuntimeExports.jsx(GradientIcon, { icon, className: "size-5" }) }) });
}
function Label({ className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "label",
    {
      "data-slot": "label",
      className: cn(
        "gap-2 text-sm leading-none font-medium group-data-[disabled=true]:opacity-50 peer-disabled:opacity-50 flex items-center select-none group-data-[disabled=true]:pointer-events-none peer-disabled:cursor-not-allowed",
        className
      ),
      ...props
    }
  );
}
function FieldGroup({ className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      "data-slot": "field-group",
      className: cn(
        "gap-5 data-[slot=checkbox-group]:gap-3 [&>[data-slot=field-group]]:gap-4 group/field-group @container/field-group flex w-full flex-col",
        className
      ),
      ...props
    }
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
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      role: "group",
      "data-slot": "field",
      "data-orientation": orientation,
      className: cn(fieldVariants({ orientation }), className),
      ...props
    }
  );
}
function FieldLabel({ className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    Label,
    {
      "data-slot": "field-label",
      className: cn(
        "has-data-checked:bg-primary/5 has-data-checked:border-primary dark:has-data-checked:bg-primary/10 gap-2 group-data-[disabled=true]/field:opacity-50 has-[>[data-slot=field]]:rounded-lg has-[>[data-slot=field]]:border [&>*]:data-[slot=field]:p-2.5 group/field-label peer/field-label flex w-fit leading-snug",
        "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col",
        className
      ),
      ...props
    }
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
    return /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "ml-4 flex list-disc flex-col gap-1", children: uniqueErrors.map((error, index) => error?.message && /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: error.message }, index)) });
  }, [children, errors]);
  if (!content) {
    return null;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { role: "alert", "data-slot": "field-error", className: cn("text-destructive text-sm font-normal", className), ...props, children: content });
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
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
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
      }
    );
  }
  const { children, ...rest } = props;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(SelectRoot, { ...rest, children });
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
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    SelectRoot,
    {
      value: value ?? null,
      onValueChange: (v) => {
        if (isEnumValue(enumObj, v)) onValueChange(v);
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { id, className, disabled, "aria-invalid": ariaInvalid, children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { children: value != null ? t(`${i18nPrefix}.${value}`) : placeholder ? t(placeholder) : null }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: options.map((v) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: v, children: t(`${i18nPrefix}.${v}`) }, v)) })
      ]
    }
  );
}
function SelectValue({ className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue$1, { "data-slot": "select-value", className: cn("flex flex-1 text-left", className), ...props });
}
function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
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
        /* @__PURE__ */ jsxRuntimeExports.jsx(SelectIcon, { render: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSelector, { className: "text-muted-foreground size-4 pointer-events-none" }) })
      ]
    }
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
  return /* @__PURE__ */ jsxRuntimeExports.jsx(SelectPortal, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
    SelectPositioner,
    {
      side,
      sideOffset,
      align,
      alignOffset,
      alignItemWithTrigger,
      className: "isolate z-50",
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
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
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectScrollUpButton, {}),
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectList, { children }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectScrollDownButton, {})
          ]
        }
      )
    }
  ) });
}
function SelectItem({ className, children, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    SelectItem$1,
    {
      "data-slot": "select-item",
      className: cn(
        "focus:bg-hover focus:text-foreground gap-1.5 rounded-none first:rounded-t-md last:rounded-b-md py-2.25 pr-8 pl-2.25 text-sm [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2 relative flex w-full cursor-pointer items-center outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      ),
      ...props,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItemText, { className: "flex flex-1 gap-2 shrink-0 whitespace-nowrap", children }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          SelectItemIndicator,
          {
            render: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "pointer-events-none absolute right-2 flex size-4 items-center justify-center" }),
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconCheck, { className: "pointer-events-none" })
          }
        )
      ]
    }
  );
}
function SelectScrollUpButton({ className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    SelectScrollUpArrow,
    {
      "data-slot": "select-scroll-up-button",
      className: cn(
        "bg-background z-10 flex cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4 top-0 w-full",
        className
      ),
      ...props,
      children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconChevronUp, {})
    }
  );
}
function SelectScrollDownButton({ className, ...props }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    SelectScrollDownArrow,
    {
      "data-slot": "select-scroll-down-button",
      className: cn(
        "bg-background z-10 flex cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4 bottom-0 w-full",
        className
      ),
      ...props,
      children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconChevronDown, {})
    }
  );
}
const inputBg = "gradient-bg-[var(--background)_-85%,color-mix(in_oklab,var(--background),var(--foreground)_10%)_110%]";
const inputBorder = "gradient-border-[oklch(from_var(--border)_l_c_h_/_0.15)_0%,oklch(from_var(--border)_l_c_h_/_0)_60%]";
const inputBorderFocus = "focus:gradient-border-[oklch(from_var(--border)_l_c_h_/_0.15)_0%,oklch(from_var(--border)_l_c_h_/_0.05)_100%]";
const Input = reactExports.forwardRef(function Input2({ className, type, ...props }, ref) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
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
    }
  );
});
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
    /* @__PURE__ */ jsxRuntimeExports.jsx(
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
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs(FieldGroup, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(form.Field, { name: "language", children: (field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
              return /* @__PURE__ */ jsxRuntimeExports.jsxs(Field, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(FieldLabel, { htmlFor: field.name, children: t("account.preferences.language") }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  Select,
                  {
                    enum: LanguageEnum,
                    i18nPrefix: "enums.Language",
                    value: field.state.value,
                    onValueChange: field.handleChange,
                    placeholder: "account.preferences.languagePlaceholder",
                    id: field.name,
                    "aria-invalid": isInvalid
                  }
                )
              ] });
            } }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(form.Field, { name: "timezone", children: (field) => /* @__PURE__ */ jsxRuntimeExports.jsxs(Field, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(FieldLabel, { htmlFor: field.name, children: t("account.preferences.timezone") }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Input,
                {
                  id: field.name,
                  type: "text",
                  placeholder: "America/Sao_Paulo",
                  value: field.state.value ?? "",
                  onBlur: field.handleBlur,
                  onChange: (e) => field.handleChange(e.target.value)
                }
              )
            ] }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Field, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(FieldLabel, { children: t("account.preferences.currency") }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "text", value: currency, disabled: true, "aria-readonly": "true", className: "opacity-60" })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(form.Subscribe, { selector: (s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting, values: s.values }), children: ({ canSubmit, isSubmitting, values }) => {
            const isPending = isSubmitting || updateProfileMutation.isPending;
            const isDisabled = !canSubmit || isPending || !preferencesSchema.safeParse(values).success;
            return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-end", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { type: "submit", disabled: isDisabled, children: [
              isPending && /* @__PURE__ */ jsxRuntimeExports.jsx(Spinner, { className: "mr-2" }),
              t("account.preferences.save")
            ] }) });
          } })
        ] })
      }
    )
  );
}
function PreferencesSection({ className, ...props }) {
  const { t } = useTranslation();
  const { data, isPending, isError } = useGetMyAccount();
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: cn("gap-0 p-0", className), ...props, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { className: "flex flex-row items-center gap-3 border-b border-border/60 px-5 py-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(GradientIconBadge, { icon: BellIcon }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-w-0 flex-col gap-0.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardTitle, { className: "text-sm font-semibold text-foreground", children: t("account.preferences.sectionTitle") }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { className: "text-xs", children: t("account.preferences.sectionDescription") })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(CardContent, { className: "px-5 py-6", children: isPending ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid gap-4 sm:grid-cols-2", children: Array.from({ length: 3 }).map((_, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Skeleton, { className: "h-4 w-20 rounded" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Skeleton, { className: "h-8 w-full rounded-lg" })
      ] }, i)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Skeleton, { className: "h-14 w-full rounded-xl" })
    ] }) : isError || !data ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground", children: t("account.preferences.loadError") }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
      PreferencesForm,
      {
        defaultValues: {
          language: data.preferences.language,
          timezone: data.preferences.timezone
        },
        currency: data.preferences.currency
      }
    ) })
  ] });
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
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: cn("flex items-center gap-4", className), ...props, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Avatar, { size: "lg", className: "size-16", children: [
      displayUrl ? /* @__PURE__ */ jsxRuntimeExports.jsx(AvatarImage, { src: displayUrl, alt: fallbackInitials }) : null,
      /* @__PURE__ */ jsxRuntimeExports.jsx(AvatarFallback, { className: "text-base", children: fallbackInitials })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          ref: fileInputRef,
          type: "file",
          accept: "image/*",
          className: "sr-only",
          "aria-label": t("account.profile.avatar.uploadAriaLabel"),
          onChange: handleFileChange
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { type: "button", variant: "secondary", size: "sm", onClick: () => fileInputRef.current?.click(), children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(IconUpload, { className: "size-3.5" }),
        t("account.profile.avatar.upload")
      ] }),
      displayUrl ? /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { type: "button", variant: "ghost", size: "sm", className: "text-destructive hover:text-destructive", onClick: handleRemove, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(IconTrash, { className: "size-3.5" }),
        t("account.profile.avatar.remove")
      ] }) : null
    ] })
  ] });
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
    /* @__PURE__ */ jsxRuntimeExports.jsx(
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
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs(FieldGroup, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(form.Field, { name: "pictureUrl", children: (field) => /* @__PURE__ */ jsxRuntimeExports.jsx(
            AvatarUploader,
            {
              value: field.state.value ?? null,
              fallbackInitials,
              onUpload: () => {
                toast.info(t("account.profile.avatar.uploadStub"));
              },
              onRemove: () => field.handleChange(null)
            }
          ) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(form.Field, { name: "name", children: (field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
              return /* @__PURE__ */ jsxRuntimeExports.jsxs(Field, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(FieldLabel, { htmlFor: field.name, children: t("account.profile.name") }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  Input,
                  {
                    id: field.name,
                    type: "text",
                    autoComplete: "name",
                    value: field.state.value ?? "",
                    onBlur: field.handleBlur,
                    onChange: (e) => field.handleChange(e.target.value),
                    "aria-invalid": isInvalid
                  }
                ),
                isInvalid && /* @__PURE__ */ jsxRuntimeExports.jsx(FieldError, { errors: field.state.meta.errors })
              ] });
            } }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Field, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(FieldLabel, { children: t("account.profile.email") }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "email", autoComplete: "email", value: defaultValues.email, disabled: true, "aria-readonly": "true", className: "opacity-60" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Field, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(FieldLabel, { children: t("account.profile.company") }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Input,
                {
                  type: "text",
                  autoComplete: "organization",
                  value: defaultValues.company ?? "",
                  disabled: true,
                  "aria-readonly": "true",
                  className: "opacity-60"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(form.Subscribe, { selector: (s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting, values: s.values }), children: ({ canSubmit, isSubmitting, values }) => {
            const isPending = isSubmitting || updateProfileMutation.isPending;
            const isDisabled = !canSubmit || isPending || !updateProfileMutationRequestSchema.safeParse(values).success;
            return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-end", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { type: "submit", disabled: isDisabled, children: [
              isPending && /* @__PURE__ */ jsxRuntimeExports.jsx(Spinner, { className: "mr-2" }),
              t("account.profile.save")
            ] }) });
          } })
        ] })
      }
    )
  );
}
function ProfileFormSection({ className, ...props }) {
  const { t } = useTranslation();
  const { data, isPending, isError } = useGetMyAccount();
  const fallbackInitials = data?.profile.name ? data.profile.name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() : "?";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: cn("gap-0 p-0", className), ...props, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { className: "flex flex-row items-center gap-3 border-b border-border/60 px-5 py-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(GradientIconBadge, { icon: UserIcon }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-w-0 flex-col gap-0.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardTitle, { className: "text-sm font-semibold text-foreground", children: t("account.profile.sectionTitle") }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { className: "text-xs", children: t("account.profile.sectionDescription") })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(CardContent, { className: "px-5 py-6", children: isPending ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Skeleton, { className: "size-16 rounded-full" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Skeleton, { className: "h-8 w-24 rounded-lg" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Skeleton, { className: "h-8 w-20 rounded-lg" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid gap-4 sm:grid-cols-2", children: Array.from({ length: 3 }).map((_, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Skeleton, { className: "h-4 w-16 rounded" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Skeleton, { className: "h-8 w-full rounded-lg" })
      ] }, i)) })
    ] }) : isError || !data ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground", children: t("account.profile.loadError") }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
      ProfileForm,
      {
        defaultValues: {
          name: data.profile.name,
          email: data.profile.email,
          company: data.profile.company,
          pictureUrl: data.profile.pictureUrl
        },
        fallbackInitials
      }
    ) })
  ] });
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
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogHeader, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTitle, { children: t("account.security.changePassword.dialogTitle") }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogDescription, { children: t("account.security.changePassword.dialogDescription") })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "form",
      {
        noValidate: true,
        onSubmit: (e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(FieldGroup, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(form.Field, { name: "currentPassword", children: (field) => /* @__PURE__ */ jsxRuntimeExports.jsxs(Field, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(FieldLabel, { htmlFor: field.name, children: t("account.security.changePassword.currentPassword") }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Input,
                {
                  id: field.name,
                  type: "password",
                  autoComplete: "current-password",
                  value: field.state.value,
                  onBlur: field.handleBlur,
                  onChange: (e) => field.handleChange(e.target.value)
                }
              ),
              field.state.meta.errors[0] && /* @__PURE__ */ jsxRuntimeExports.jsx(FieldError, { children: String(field.state.meta.errors[0]?.message ?? "") })
            ] }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(form.Field, { name: "newPassword", children: (field) => /* @__PURE__ */ jsxRuntimeExports.jsxs(Field, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(FieldLabel, { htmlFor: field.name, children: t("account.security.changePassword.newPassword") }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Input,
                {
                  id: field.name,
                  type: "password",
                  autoComplete: "new-password",
                  value: field.state.value,
                  onBlur: field.handleBlur,
                  onChange: (e) => field.handleChange(e.target.value)
                }
              ),
              field.state.meta.errors[0] && /* @__PURE__ */ jsxRuntimeExports.jsx(FieldError, { children: String(field.state.meta.errors[0]?.message ?? "") })
            ] }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(form.Field, { name: "confirmPassword", children: (field) => /* @__PURE__ */ jsxRuntimeExports.jsxs(Field, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(FieldLabel, { htmlFor: field.name, children: t("account.security.changePassword.confirmPassword") }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Input,
                {
                  id: field.name,
                  type: "password",
                  autoComplete: "new-password",
                  value: field.state.value,
                  onBlur: field.handleBlur,
                  onChange: (e) => field.handleChange(e.target.value)
                }
              ),
              field.state.meta.errors[0] && /* @__PURE__ */ jsxRuntimeExports.jsx(FieldError, { children: String(field.state.meta.errors[0]?.message ?? "") })
            ] }) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogFooter, { className: "mt-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "button", variant: "outline", onClick: hide, children: t("account.security.changePassword.cancel") }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(form.Subscribe, { selector: (s) => [s.canSubmit, s.isSubmitting], children: ([canSubmit, isSubmitting]) => /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { type: "submit", disabled: !canSubmit, children: [
              isSubmitting ? /* @__PURE__ */ jsxRuntimeExports.jsx(Spinner, { className: "mr-2" }) : null,
              t("account.security.changePassword.submit")
            ] }) })
          ] })
        ]
      }
    )
  ] });
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
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: cn("gap-0 p-0", className), ...props, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { className: "flex flex-row items-center gap-3 border-b border-border/60 px-5 py-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(GradientIconBadge, { icon: LockIcon }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-w-0 flex-col gap-0.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardTitle, { className: "text-sm font-semibold text-foreground", children: t("account.security.sectionTitle") }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { className: "text-xs", children: t("account.security.sectionDescription") })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(CardContent, { className: "flex flex-col gap-4 px-5 py-6", children: isPending ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Skeleton, { className: "h-10 w-48 rounded-lg" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Skeleton, { className: "h-px w-full" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Skeleton, { className: "h-10 w-40 rounded-lg" })
    ] }) : isError || !data ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground", children: t("account.security.loadError") }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(IconShieldCheck, { className: cn("size-4", data.security.twoFactorEnabled ? "text-success" : "text-muted-foreground") }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: cn("font-medium", data.security.twoFactorEnabled ? "text-success" : "text-muted-foreground"), children: data.security.twoFactorEnabled ? t("account.security.twoFactor.enabled") : t("account.security.twoFactor.disabled") })
      ] }),
      data.security.lastPasswordChangeAt ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: t("account.security.lastPasswordChange", {
        date: new Intl.DateTimeFormat(locale, {
          year: "numeric",
          month: "short",
          day: "numeric"
        }).format(new Date(data.security.lastPasswordChangeAt))
      }) }) : null,
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-t border-border/60" }),
      data.security.hasPassword ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-0.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-foreground", children: t("account.security.changePassword.label") }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground", children: t("account.security.changePassword.description") })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "secondary", size: "sm", onClick: () => show(/* @__PURE__ */ jsxRuntimeExports.jsx(ChangePasswordDialog, {})), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(IconKey, { className: "size-3.5" }),
          t("account.security.changePassword.button")
        ] })
      ] }) : null,
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-t border-border/60" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-0.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-destructive", children: t("account.security.deleteAccount.label") }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground", children: t("account.security.deleteAccount.description") })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "destructive", size: "sm", onClick: handleDeleteAccount, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(IconTrash, { className: "size-3.5" }),
          t("account.security.deleteAccount.button")
        ] })
      ] })
    ] }) })
  ] });
}
function RouteComponent() {
  const {
    t
  } = useTranslation();
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-1 flex-col gap-6 overflow-y-auto p-6 md:p-8", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(AccountHeaderSection, { title: t("account.header.title") }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ProfileFormSection, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsx(PreferencesSection, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SecuritySection, {})
  ] });
}
export {
  RouteComponent as component
};

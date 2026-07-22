import { r as reactExports, j as jsxRuntimeExports, b as React } from "./react.mjs";
import { f as functionalUpdate, F as FieldApi, u as uuid, a as FormGroupApi, b as FormApi, m as mergeAndUpdate } from "./tanstack__form-core.mjs";
import { u as useSelector } from "./tanstack__react-store.mjs";
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? reactExports.useLayoutEffect : reactExports.useEffect;
function useField(opts) {
  const [prevOptions, setPrevOptions] = reactExports.useState(() => ({
    form: opts.form,
    name: opts.name
  }));
  const [fieldApiState, setFieldApi] = reactExports.useState(() => {
    return new FieldApi({
      ...opts
    });
  });
  let fieldApi = fieldApiState;
  if (prevOptions.form !== opts.form || prevOptions.name !== opts.name) {
    fieldApi = new FieldApi({
      ...opts
    });
    setFieldApi(fieldApi);
    setPrevOptions({ form: opts.form, name: opts.name });
  }
  const reactiveStateValue = useSelector(
    fieldApi.store,
    opts.mode === "array" ? (state) => state.meta._arrayVersion || 0 : (state) => state.value
  );
  const reactiveMetaIsTouched = useSelector(
    fieldApi.store,
    (state) => state.meta.isTouched
  );
  const reactiveMetaIsBlurred = useSelector(
    fieldApi.store,
    (state) => state.meta.isBlurred
  );
  const reactiveMetaIsDirty = useSelector(
    fieldApi.store,
    (state) => state.meta.isDirty
  );
  const reactiveMetaErrorMap = useSelector(
    fieldApi.store,
    (state) => state.meta.errorMap
  );
  const reactiveMetaErrorSourceMap = useSelector(
    fieldApi.store,
    (state) => state.meta.errorSourceMap
  );
  const reactiveMetaIsValidating = useSelector(
    fieldApi.store,
    (state) => state.meta.isValidating
  );
  const extendedFieldApi = reactExports.useMemo(() => {
    const reactiveFieldApi = {
      ...fieldApi,
      get state() {
        return {
          // For array mode, reactiveStateValue is the length (for reactivity tracking),
          // so we need to get the actual value from fieldApi
          value: opts.mode === "array" ? fieldApi.state.value : reactiveStateValue,
          get meta() {
            return {
              ...fieldApi.state.meta,
              isTouched: reactiveMetaIsTouched,
              isBlurred: reactiveMetaIsBlurred,
              isDirty: reactiveMetaIsDirty,
              errorMap: reactiveMetaErrorMap,
              errorSourceMap: reactiveMetaErrorSourceMap,
              isValidating: reactiveMetaIsValidating
            };
          }
        };
      }
    };
    const extendedApi = reactiveFieldApi;
    return extendedApi;
  }, [
    fieldApi,
    opts.mode,
    reactiveStateValue,
    reactiveMetaIsTouched,
    reactiveMetaIsBlurred,
    reactiveMetaIsDirty,
    reactiveMetaErrorMap,
    reactiveMetaErrorSourceMap,
    reactiveMetaIsValidating
  ]);
  useIsomorphicLayoutEffect(fieldApi.mount, [fieldApi]);
  useIsomorphicLayoutEffect(() => {
    fieldApi.update(opts);
  });
  return extendedFieldApi;
}
const Field = (({
  children,
  ...fieldOptions
}) => {
  const fieldApi = useField(fieldOptions);
  const jsxToDisplay = reactExports.useMemo(
    () => functionalUpdate(children, fieldApi),
    [children, fieldApi]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: jsxToDisplay });
});
function useUUID() {
  return reactExports.useState(() => uuid())[0];
}
const _React = React;
const useFormId = reactExports.version.split(".")[0] === "17" ? useUUID : _React.useId;
function useFormGroup(opts) {
  const [prevOptions, setPrevOptions] = reactExports.useState(() => ({
    form: opts.form,
    name: opts.name
  }));
  const [formGroupApi, setFormGroupApi] = reactExports.useState(() => {
    return new FormGroupApi({
      ...opts
    });
  });
  if (prevOptions.form !== opts.form || prevOptions.name !== opts.name) {
    setFormGroupApi(
      new FormGroupApi({
        ...opts
      })
    );
    setPrevOptions({ form: opts.form, name: opts.name });
  }
  const reactiveStateValue = useSelector(
    formGroupApi.store,
    (state) => state.value
  );
  const reactiveMetaIsTouched = useSelector(
    formGroupApi.store,
    (state) => state.meta.isTouched
  );
  const reactiveMetaIsBlurred = useSelector(
    formGroupApi.store,
    (state) => state.meta.isBlurred
  );
  const reactiveMetaIsDirty = useSelector(
    formGroupApi.store,
    (state) => state.meta.isDirty
  );
  const reactiveMetaErrorMap = useSelector(
    formGroupApi.store,
    (state) => state.meta.errorMap
  );
  const reactiveMetaErrorSourceMap = useSelector(
    formGroupApi.store,
    (state) => state.meta.errorSourceMap
  );
  const reactiveMetaIsValidating = useSelector(
    formGroupApi.store,
    (state) => state.meta.isValidating
  );
  const reactiveMetaIsSubmitting = useSelector(
    formGroupApi.store,
    (state) => state.meta.isSubmitting
  );
  const reactiveMetaIsSubmitted = useSelector(
    formGroupApi.store,
    (state) => state.meta.isSubmitted
  );
  const reactiveMetaSubmissionAttempts = useSelector(
    formGroupApi.store,
    (state) => state.meta.submissionAttempts
  );
  const reactiveMetaIsSubmitSuccessful = useSelector(
    formGroupApi.store,
    (state) => state.meta.isSubmitSuccessful
  );
  const reactiveMetaCanSubmit = useSelector(
    formGroupApi.store,
    (state) => state.meta.canSubmit
  );
  const reactiveMetaIsValid = useSelector(
    formGroupApi.store,
    (state) => state.meta.isValid
  );
  const reactiveMetaIsFieldsValid = useSelector(
    formGroupApi.store,
    (state) => state.meta.isFieldsValid
  );
  const reactiveMetaIsFieldsValidating = useSelector(
    formGroupApi.store,
    (state) => state.meta.isFieldsValidating
  );
  const reactiveMetaIsGroupValid = useSelector(
    formGroupApi.store,
    (state) => state.meta.isGroupValid
  );
  const extendedFieldApi = reactExports.useMemo(() => {
    const reactiveFieldApi = {
      ...formGroupApi,
      handleSubmit: ((...props) => {
        return formGroupApi._handleSubmit(...props);
      }),
      get state() {
        return {
          ...formGroupApi.state,
          value: reactiveStateValue,
          get meta() {
            return {
              ...formGroupApi.state.meta,
              isTouched: reactiveMetaIsTouched,
              isBlurred: reactiveMetaIsBlurred,
              isDirty: reactiveMetaIsDirty,
              errorMap: reactiveMetaErrorMap,
              errorSourceMap: reactiveMetaErrorSourceMap,
              isValidating: reactiveMetaIsValidating,
              isSubmitting: reactiveMetaIsSubmitting,
              isSubmitted: reactiveMetaIsSubmitted,
              submissionAttempts: reactiveMetaSubmissionAttempts,
              isSubmitSuccessful: reactiveMetaIsSubmitSuccessful,
              canSubmit: reactiveMetaCanSubmit,
              isValid: reactiveMetaIsValid,
              isFieldsValid: reactiveMetaIsFieldsValid,
              isFieldsValidating: reactiveMetaIsFieldsValidating,
              isGroupValid: reactiveMetaIsGroupValid
            };
          }
        };
      }
    };
    const extendedApi = reactiveFieldApi;
    return extendedApi;
  }, [
    formGroupApi,
    reactiveStateValue,
    reactiveMetaIsTouched,
    reactiveMetaIsBlurred,
    reactiveMetaIsDirty,
    reactiveMetaErrorMap,
    reactiveMetaErrorSourceMap,
    reactiveMetaIsValidating,
    reactiveMetaIsSubmitting,
    reactiveMetaIsSubmitted,
    reactiveMetaSubmissionAttempts,
    reactiveMetaIsSubmitSuccessful,
    reactiveMetaCanSubmit,
    reactiveMetaIsValid,
    reactiveMetaIsFieldsValid,
    reactiveMetaIsFieldsValidating,
    reactiveMetaIsGroupValid
  ]);
  useIsomorphicLayoutEffect(formGroupApi.mount, [formGroupApi]);
  useIsomorphicLayoutEffect(() => {
    formGroupApi.update(opts);
  });
  return extendedFieldApi;
}
const FormGroup = (({
  children,
  ...formGroupOptions
}) => {
  const formGroupApi = useFormGroup(formGroupOptions);
  const jsxToDisplay = reactExports.useMemo(
    () => functionalUpdate(children, formGroupApi),
    [children, formGroupApi]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: jsxToDisplay });
});
function LocalSubscribe({
  form,
  selector = (state) => state,
  children
}) {
  const data = useSelector(form.store, selector);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: functionalUpdate(children, data) });
}
function useForm(opts) {
  const fallbackFormId = useFormId();
  const [prevFormId, setPrevFormId] = reactExports.useState(opts?.formId);
  const [formApi, setFormApi] = reactExports.useState(() => {
    return new FormApi({ ...opts, formId: opts?.formId ?? fallbackFormId });
  });
  if (prevFormId !== opts?.formId) {
    const formId = opts?.formId ?? fallbackFormId;
    setFormApi(new FormApi({ ...opts, formId }));
    setPrevFormId(formId);
  }
  const extendedFormApi = reactExports.useMemo(() => {
    const extendedApi = {
      ...formApi,
      handleSubmit: ((...props) => {
        return formApi._handleSubmit(...props);
      }),
      // We must add all `get`ters from `core`'s `FormApi` here, as otherwise the spread operator won't catch those
      get formId() {
        return formApi._formId;
      },
      get state() {
        return formApi.store.state;
      }
    };
    extendedApi.Field = function APIField(props) {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { ...props, form: formApi });
    };
    extendedApi.FormGroup = function APIFormGroup(props) {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(FormGroup, { ...props, form: formApi });
    };
    extendedApi.Subscribe = function Subscribe(props) {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        LocalSubscribe,
        {
          form: formApi,
          selector: props.selector,
          children: props.children
        }
      );
    };
    return extendedApi;
  }, [formApi]);
  useIsomorphicLayoutEffect(formApi.mount, []);
  useIsomorphicLayoutEffect(() => {
    formApi.update(opts);
  });
  const hasRan = reactExports.useRef(false);
  useIsomorphicLayoutEffect(() => {
    if (!hasRan.current) return;
    if (!opts?.transform) return;
    mergeAndUpdate(formApi, opts.transform);
  }, [formApi, opts?.transform]);
  useIsomorphicLayoutEffect(() => {
    hasRan.current = true;
  });
  return extendedFormApi;
}
export {
  useForm as u
};

import { r as reactExports, j as jsxRuntimeExports } from "./react.mjs";
import { m as mergeObjects, f as formatErrorMessage, u as useStableCallback, a as useIsoLayoutEffect, E as EMPTY_OBJECT, b as useMergedRefs, c as useMergedRefsN, g as getReactElementRef, N as NOOP, d as useTimeout, e as useId, i as isAndroid, h as isJSDOM, j as useRefWithInit, k as isSafari, v as visuallyHidden, l as useValueAsRef, n as useAnimationFrame, T as Timeout, R as ReactStore, o as createSelector, A as AnimationFrame, p as EMPTY_ARRAY, q as inertValue, r as isIOS, s as useEnhancedClickHandler, t as useScrollLock, w as useOnMount, x as ownerDocument, y as useControlled, z as visuallyHiddenInput, S as Store, B as useStore, C as useOnFirstRender, D as isWebKit$1, F as isMouseWithinBounds } from "./base-ui__utils.mjs";
import { r as reactDomExports } from "./react-dom.mjs";
import { a as isHTMLElement, b as isShadowRoot, f as floor, c as getNodeName, d as isNode, g as getWindow, e as getComputedStyle$1, h as isElement, j as isLastTraversableNode, k as getParentNode, l as getOverflowAncestors, m as isWebKit, n as evaluate, o as getPaddingObject, p as getAlignmentAxis, q as getAlignment, r as getAxisLength, s as clamp$1, t as getSide, u as getSideAxis } from "./floating-ui__utils.mjs";
import { u as useFloating$1, h as hide$1, f as flip, s as size, o as offset, a as shift, l as limitShift } from "./floating-ui__react-dom.mjs";
import { a as autoUpdate } from "./floating-ui__dom.mjs";
import { t as tabbable, i as isTabbable, f as focusable } from "./tabbable.mjs";
const EMPTY_PROPS = {};
function mergeProps$1(a, b, c, d, e) {
  let merged = {
    ...resolvePropsGetter(a, EMPTY_PROPS)
  };
  if (b) {
    merged = mergeOne(merged, b);
  }
  if (c) {
    merged = mergeOne(merged, c);
  }
  if (d) {
    merged = mergeOne(merged, d);
  }
  if (e) {
    merged = mergeOne(merged, e);
  }
  return merged;
}
function mergePropsN(props) {
  if (props.length === 0) {
    return EMPTY_PROPS;
  }
  if (props.length === 1) {
    return resolvePropsGetter(props[0], EMPTY_PROPS);
  }
  let merged = {
    ...resolvePropsGetter(props[0], EMPTY_PROPS)
  };
  for (let i = 1; i < props.length; i += 1) {
    merged = mergeOne(merged, props[i]);
  }
  return merged;
}
function mergeOne(merged, inputProps) {
  if (isPropsGetter(inputProps)) {
    return inputProps(merged);
  }
  return mutablyMergeInto(merged, inputProps);
}
function mutablyMergeInto(mergedProps, externalProps) {
  if (!externalProps) {
    return mergedProps;
  }
  for (const propName in externalProps) {
    const externalPropValue = externalProps[propName];
    switch (propName) {
      case "style": {
        mergedProps[propName] = mergeObjects(mergedProps.style, externalPropValue);
        break;
      }
      case "className": {
        mergedProps[propName] = mergeClassNames(mergedProps.className, externalPropValue);
        break;
      }
      default: {
        if (isEventHandler(propName, externalPropValue)) {
          mergedProps[propName] = mergeEventHandlers(mergedProps[propName], externalPropValue);
        } else {
          mergedProps[propName] = externalPropValue;
        }
      }
    }
  }
  return mergedProps;
}
function isEventHandler(key, value) {
  const code0 = key.charCodeAt(0);
  const code1 = key.charCodeAt(1);
  const code2 = key.charCodeAt(2);
  return code0 === 111 && code1 === 110 && code2 >= 65 && code2 <= 90 && (typeof value === "function" || typeof value === "undefined");
}
function isPropsGetter(inputProps) {
  return typeof inputProps === "function";
}
function resolvePropsGetter(inputProps, previousProps) {
  if (isPropsGetter(inputProps)) {
    return inputProps(previousProps);
  }
  return inputProps ?? EMPTY_PROPS;
}
function mergeEventHandlers(ourHandler, theirHandler) {
  if (!theirHandler) {
    return ourHandler;
  }
  if (!ourHandler) {
    return theirHandler;
  }
  return (event) => {
    if (isSyntheticEvent(event)) {
      const baseUIEvent = event;
      makeEventPreventable(baseUIEvent);
      const result2 = theirHandler(baseUIEvent);
      if (!baseUIEvent.baseUIHandlerPrevented) {
        ourHandler?.(baseUIEvent);
      }
      return result2;
    }
    const result = theirHandler(event);
    ourHandler?.(event);
    return result;
  };
}
function makeEventPreventable(event) {
  event.preventBaseUIHandler = () => {
    event.baseUIHandlerPrevented = true;
  };
  return event;
}
function mergeClassNames(ourClassName, theirClassName) {
  if (theirClassName) {
    if (ourClassName) {
      return theirClassName + " " + ourClassName;
    }
    return theirClassName;
  }
  return ourClassName;
}
function isSyntheticEvent(event) {
  return event != null && typeof event === "object" && "nativeEvent" in event;
}
const CompositeRootContext = /* @__PURE__ */ reactExports.createContext(void 0);
function useCompositeRootContext(optional = false) {
  const context = reactExports.useContext(CompositeRootContext);
  if (context === void 0 && !optional) {
    throw new Error(formatErrorMessage(16));
  }
  return context;
}
function useFocusableWhenDisabled(parameters) {
  const {
    focusableWhenDisabled,
    disabled,
    composite = false,
    tabIndex: tabIndexProp = 0,
    isNativeButton
  } = parameters;
  const isFocusableComposite = composite && focusableWhenDisabled !== false;
  const isNonFocusableComposite = composite && focusableWhenDisabled === false;
  const props = reactExports.useMemo(() => {
    const additionalProps = {
      // allow Tabbing away from focusableWhenDisabled elements
      onKeyDown(event) {
        if (disabled && focusableWhenDisabled && event.key !== "Tab") {
          event.preventDefault();
        }
      }
    };
    if (!composite) {
      additionalProps.tabIndex = tabIndexProp;
      if (!isNativeButton && disabled) {
        additionalProps.tabIndex = focusableWhenDisabled ? tabIndexProp : -1;
      }
    }
    if (isNativeButton && (focusableWhenDisabled || isFocusableComposite) || !isNativeButton && disabled) {
      additionalProps["aria-disabled"] = disabled;
    }
    if (isNativeButton && (!focusableWhenDisabled || isNonFocusableComposite)) {
      additionalProps.disabled = disabled;
    }
    return additionalProps;
  }, [composite, disabled, focusableWhenDisabled, isFocusableComposite, isNonFocusableComposite, isNativeButton, tabIndexProp]);
  return {
    props
  };
}
function useButton(parameters = {}) {
  const {
    disabled = false,
    focusableWhenDisabled,
    tabIndex = 0,
    native: isNativeButton = true
  } = parameters;
  const elementRef = reactExports.useRef(null);
  const isCompositeItem = useCompositeRootContext(true) !== void 0;
  const isValidLink = useStableCallback(() => {
    const element = elementRef.current;
    return Boolean(element?.tagName === "A" && element?.href);
  });
  const {
    props: focusableWhenDisabledProps
  } = useFocusableWhenDisabled({
    focusableWhenDisabled,
    disabled,
    composite: isCompositeItem,
    tabIndex,
    isNativeButton
  });
  const updateDisabled = reactExports.useCallback(() => {
    const element = elementRef.current;
    if (!isButtonElement(element)) {
      return;
    }
    if (isCompositeItem && disabled && focusableWhenDisabledProps.disabled === void 0 && element.disabled) {
      element.disabled = false;
    }
  }, [disabled, focusableWhenDisabledProps.disabled, isCompositeItem]);
  useIsoLayoutEffect(updateDisabled, [updateDisabled]);
  const getButtonProps = reactExports.useCallback((externalProps = {}) => {
    const {
      onClick: externalOnClick,
      onMouseDown: externalOnMouseDown,
      onKeyUp: externalOnKeyUp,
      onKeyDown: externalOnKeyDown,
      onPointerDown: externalOnPointerDown,
      ...otherExternalProps
    } = externalProps;
    const type = isNativeButton ? "button" : void 0;
    return mergeProps$1({
      type,
      onClick(event) {
        if (disabled) {
          event.preventDefault();
          return;
        }
        externalOnClick?.(event);
      },
      onMouseDown(event) {
        if (!disabled) {
          externalOnMouseDown?.(event);
        }
      },
      onKeyDown(event) {
        if (!disabled) {
          makeEventPreventable(event);
          externalOnKeyDown?.(event);
        }
        if (event.baseUIHandlerPrevented) {
          return;
        }
        const shouldClick = event.target === event.currentTarget && !isNativeButton && !isValidLink() && !disabled;
        const isEnterKey = event.key === "Enter";
        const isSpaceKey = event.key === " ";
        if (shouldClick) {
          if (isSpaceKey || isEnterKey) {
            event.preventDefault();
          }
          if (isEnterKey) {
            externalOnClick?.(event);
          }
        }
      },
      onKeyUp(event) {
        if (!disabled) {
          makeEventPreventable(event);
          externalOnKeyUp?.(event);
        }
        if (event.baseUIHandlerPrevented) {
          return;
        }
        if (event.target === event.currentTarget && !isNativeButton && !disabled && event.key === " ") {
          externalOnClick?.(event);
        }
      },
      onPointerDown(event) {
        if (disabled) {
          event.preventDefault();
          return;
        }
        externalOnPointerDown?.(event);
      }
    }, !isNativeButton ? {
      role: "button"
    } : void 0, focusableWhenDisabledProps, otherExternalProps);
  }, [disabled, focusableWhenDisabledProps, isNativeButton, isValidLink]);
  const buttonRef = useStableCallback((element) => {
    elementRef.current = element;
    updateDisabled();
  });
  return {
    getButtonProps,
    buttonRef
  };
}
function isButtonElement(elem) {
  return isHTMLElement(elem) && elem.tagName === "BUTTON";
}
function getStateAttributesProps(state, customMapping) {
  const props = {};
  for (const key in state) {
    const value = state[key];
    if (customMapping?.hasOwnProperty(key)) {
      const customProps = customMapping[key](value);
      if (customProps != null) {
        Object.assign(props, customProps);
      }
      continue;
    }
    if (value === true) {
      props[`data-${key.toLowerCase()}`] = "";
    } else if (value) {
      props[`data-${key.toLowerCase()}`] = value.toString();
    }
  }
  return props;
}
function resolveClassName(className, state) {
  return typeof className === "function" ? className(state) : className;
}
function resolveStyle(style, state) {
  return typeof style === "function" ? style(state) : style;
}
const PATIENT_CLICK_THRESHOLD = 500;
const DISABLED_TRANSITIONS_STYLE = {
  style: {
    transition: "none"
  }
};
const CLICK_TRIGGER_IDENTIFIER = "data-base-ui-click-trigger";
const DROPDOWN_COLLISION_AVOIDANCE = {
  fallbackAxisSide: "none"
};
const POPUP_COLLISION_AVOIDANCE = {
  fallbackAxisSide: "end"
};
const ownerVisuallyHidden = {
  clipPath: "inset(50%)",
  position: "fixed",
  top: 0,
  left: 0
};
function useRenderElement(element, componentProps, params = {}) {
  const renderProp = componentProps.render;
  const outProps = useRenderElementProps(componentProps, params);
  if (params.enabled === false) {
    return null;
  }
  const state = params.state ?? EMPTY_OBJECT;
  return evaluateRenderProp(element, renderProp, outProps, state);
}
function useRenderElementProps(componentProps, params = {}) {
  const {
    className: classNameProp,
    style: styleProp,
    render: renderProp
  } = componentProps;
  const {
    state = EMPTY_OBJECT,
    ref,
    props,
    stateAttributesMapping: stateAttributesMapping2,
    enabled = true
  } = params;
  const className = enabled ? resolveClassName(classNameProp, state) : void 0;
  const style = enabled ? resolveStyle(styleProp, state) : void 0;
  const stateProps = enabled ? getStateAttributesProps(state, stateAttributesMapping2) : EMPTY_OBJECT;
  const outProps = enabled ? mergeObjects(stateProps, Array.isArray(props) ? mergePropsN(props) : props) ?? EMPTY_OBJECT : EMPTY_OBJECT;
  if (typeof document !== "undefined") {
    if (!enabled) {
      useMergedRefs(null, null);
    } else if (Array.isArray(ref)) {
      outProps.ref = useMergedRefsN([outProps.ref, getReactElementRef(renderProp), ...ref]);
    } else {
      outProps.ref = useMergedRefs(outProps.ref, getReactElementRef(renderProp), ref);
    }
  }
  if (!enabled) {
    return EMPTY_OBJECT;
  }
  if (className !== void 0) {
    outProps.className = mergeClassNames(outProps.className, className);
  }
  if (style !== void 0) {
    outProps.style = mergeObjects(outProps.style, style);
  }
  return outProps;
}
function evaluateRenderProp(element, render, props, state) {
  if (render) {
    if (typeof render === "function") {
      return render(props, state);
    }
    const mergedProps = mergeProps$1(props, render.props);
    mergedProps.ref = props.ref;
    return /* @__PURE__ */ reactExports.cloneElement(render, mergedProps);
  }
  if (element) {
    if (typeof element === "string") {
      return renderTag(element, props);
    }
  }
  throw new Error(formatErrorMessage(8));
}
function renderTag(Tag, props) {
  if (Tag === "button") {
    return /* @__PURE__ */ reactExports.createElement("button", {
      type: "button",
      ...props,
      key: props.key
    });
  }
  if (Tag === "img") {
    return /* @__PURE__ */ reactExports.createElement("img", {
      alt: "",
      ...props,
      key: props.key
    });
  }
  return /* @__PURE__ */ reactExports.createElement(Tag, props);
}
const Button = /* @__PURE__ */ reactExports.forwardRef(function Button2(componentProps, forwardedRef) {
  const {
    render,
    className,
    disabled = false,
    focusableWhenDisabled = false,
    nativeButton = true,
    ...elementProps
  } = componentProps;
  const {
    getButtonProps,
    buttonRef
  } = useButton({
    disabled,
    focusableWhenDisabled,
    native: nativeButton
  });
  const state = reactExports.useMemo(() => ({
    disabled
  }), [disabled]);
  return useRenderElement("button", componentProps, {
    state,
    ref: [forwardedRef, buttonRef],
    props: [elementProps, getButtonProps]
  });
});
const AvatarRootContext = /* @__PURE__ */ reactExports.createContext(void 0);
function useAvatarRootContext() {
  const context = reactExports.useContext(AvatarRootContext);
  if (context === void 0) {
    throw new Error(formatErrorMessage(13));
  }
  return context;
}
const avatarStateAttributesMapping = {
  imageLoadingStatus: () => null
};
const AvatarRoot = /* @__PURE__ */ reactExports.forwardRef(function AvatarRoot2(componentProps, forwardedRef) {
  const {
    className,
    render,
    ...elementProps
  } = componentProps;
  const [imageLoadingStatus, setImageLoadingStatus] = reactExports.useState("idle");
  const state = reactExports.useMemo(() => ({
    imageLoadingStatus
  }), [imageLoadingStatus]);
  const contextValue = reactExports.useMemo(() => ({
    imageLoadingStatus,
    setImageLoadingStatus
  }), [imageLoadingStatus, setImageLoadingStatus]);
  const element = useRenderElement("span", componentProps, {
    state,
    ref: forwardedRef,
    props: elementProps,
    stateAttributesMapping: avatarStateAttributesMapping
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(AvatarRootContext.Provider, {
    value: contextValue,
    children: element
  });
});
function useImageLoadingStatus(src, {
  referrerPolicy,
  crossOrigin
}) {
  const [loadingStatus, setLoadingStatus] = reactExports.useState("idle");
  useIsoLayoutEffect(() => {
    if (!src) {
      setLoadingStatus("error");
      return NOOP;
    }
    let isMounted = true;
    const image = new window.Image();
    const updateStatus = (status) => () => {
      if (!isMounted) {
        return;
      }
      setLoadingStatus(status);
    };
    setLoadingStatus("loading");
    image.onload = updateStatus("loaded");
    image.onerror = updateStatus("error");
    if (referrerPolicy) {
      image.referrerPolicy = referrerPolicy;
    }
    image.crossOrigin = crossOrigin ?? null;
    image.src = src;
    return () => {
      isMounted = false;
    };
  }, [src, crossOrigin, referrerPolicy]);
  return loadingStatus;
}
const AvatarImage = /* @__PURE__ */ reactExports.forwardRef(function AvatarImage2(componentProps, forwardedRef) {
  const {
    className,
    render,
    onLoadingStatusChange: onLoadingStatusChangeProp,
    referrerPolicy,
    crossOrigin,
    ...elementProps
  } = componentProps;
  const context = useAvatarRootContext();
  const imageLoadingStatus = useImageLoadingStatus(componentProps.src, {
    referrerPolicy,
    crossOrigin
  });
  const handleLoadingStatusChange = useStableCallback((status) => {
    onLoadingStatusChangeProp?.(status);
    context.setImageLoadingStatus(status);
  });
  useIsoLayoutEffect(() => {
    if (imageLoadingStatus !== "idle") {
      handleLoadingStatusChange(imageLoadingStatus);
    }
  }, [imageLoadingStatus, handleLoadingStatusChange]);
  const state = reactExports.useMemo(() => ({
    imageLoadingStatus
  }), [imageLoadingStatus]);
  const element = useRenderElement("img", componentProps, {
    state,
    ref: forwardedRef,
    props: elementProps,
    stateAttributesMapping: avatarStateAttributesMapping,
    enabled: imageLoadingStatus === "loaded"
  });
  return element;
});
const AvatarFallback = /* @__PURE__ */ reactExports.forwardRef(function AvatarFallback2(componentProps, forwardedRef) {
  const {
    className,
    render,
    delay,
    ...elementProps
  } = componentProps;
  const {
    imageLoadingStatus
  } = useAvatarRootContext();
  const [delayPassed, setDelayPassed] = reactExports.useState(delay === void 0);
  const timeout = useTimeout();
  reactExports.useEffect(() => {
    if (delay !== void 0) {
      timeout.start(delay, () => setDelayPassed(true));
    }
    return timeout.clear;
  }, [timeout, delay]);
  const state = reactExports.useMemo(() => ({
    imageLoadingStatus
  }), [imageLoadingStatus]);
  const element = useRenderElement("span", componentProps, {
    state,
    ref: forwardedRef,
    props: elementProps,
    stateAttributesMapping: avatarStateAttributesMapping,
    enabled: imageLoadingStatus !== "loaded" && delayPassed
  });
  return element;
});
const DialogRootContext = /* @__PURE__ */ reactExports.createContext(void 0);
function useDialogRootContext(optional) {
  const dialogRootContext = reactExports.useContext(DialogRootContext);
  if (optional === false && dialogRootContext === void 0) {
    throw new Error(formatErrorMessage(27));
  }
  return dialogRootContext;
}
let TransitionStatusDataAttributes = /* @__PURE__ */ (function(TransitionStatusDataAttributes2) {
  TransitionStatusDataAttributes2["startingStyle"] = "data-starting-style";
  TransitionStatusDataAttributes2["endingStyle"] = "data-ending-style";
  return TransitionStatusDataAttributes2;
})({});
const STARTING_HOOK = {
  [TransitionStatusDataAttributes.startingStyle]: ""
};
const ENDING_HOOK = {
  [TransitionStatusDataAttributes.endingStyle]: ""
};
const transitionStatusMapping = {
  transitionStatus(value) {
    if (value === "starting") {
      return STARTING_HOOK;
    }
    if (value === "ending") {
      return ENDING_HOOK;
    }
    return null;
  }
};
let CommonPopupDataAttributes = (function(CommonPopupDataAttributes2) {
  CommonPopupDataAttributes2["open"] = "data-open";
  CommonPopupDataAttributes2["closed"] = "data-closed";
  CommonPopupDataAttributes2[CommonPopupDataAttributes2["startingStyle"] = TransitionStatusDataAttributes.startingStyle] = "startingStyle";
  CommonPopupDataAttributes2[CommonPopupDataAttributes2["endingStyle"] = TransitionStatusDataAttributes.endingStyle] = "endingStyle";
  CommonPopupDataAttributes2["anchorHidden"] = "data-anchor-hidden";
  return CommonPopupDataAttributes2;
})({});
let CommonTriggerDataAttributes = /* @__PURE__ */ (function(CommonTriggerDataAttributes2) {
  CommonTriggerDataAttributes2["popupOpen"] = "data-popup-open";
  CommonTriggerDataAttributes2["pressed"] = "data-pressed";
  return CommonTriggerDataAttributes2;
})({});
const TRIGGER_HOOK = {
  [CommonTriggerDataAttributes.popupOpen]: ""
};
const PRESSABLE_TRIGGER_HOOK = {
  [CommonTriggerDataAttributes.popupOpen]: "",
  [CommonTriggerDataAttributes.pressed]: ""
};
const POPUP_OPEN_HOOK = {
  [CommonPopupDataAttributes.open]: ""
};
const POPUP_CLOSED_HOOK = {
  [CommonPopupDataAttributes.closed]: ""
};
const ANCHOR_HIDDEN_HOOK = {
  [CommonPopupDataAttributes.anchorHidden]: ""
};
const triggerOpenStateMapping = {
  open(value) {
    if (value) {
      return TRIGGER_HOOK;
    }
    return null;
  }
};
const pressableTriggerOpenStateMapping = {
  open(value) {
    if (value) {
      return PRESSABLE_TRIGGER_HOOK;
    }
    return null;
  }
};
const popupStateMapping = {
  open(value) {
    if (value) {
      return POPUP_OPEN_HOOK;
    }
    return POPUP_CLOSED_HOOK;
  },
  anchorHidden(value) {
    if (value) {
      return ANCHOR_HIDDEN_HOOK;
    }
    return null;
  }
};
const stateAttributesMapping$5 = {
  ...popupStateMapping,
  ...transitionStatusMapping
};
const DialogBackdrop = /* @__PURE__ */ reactExports.forwardRef(function DialogBackdrop2(componentProps, forwardedRef) {
  const {
    render,
    className,
    forceRender = false,
    ...elementProps
  } = componentProps;
  const {
    store
  } = useDialogRootContext();
  const open = store.useState("open");
  const nested = store.useState("nested");
  const mounted = store.useState("mounted");
  const transitionStatus = store.useState("transitionStatus");
  const state = reactExports.useMemo(() => ({
    open,
    transitionStatus
  }), [open, transitionStatus]);
  return useRenderElement("div", componentProps, {
    state,
    ref: [store.context.backdropRef, forwardedRef],
    stateAttributesMapping: stateAttributesMapping$5,
    props: [{
      role: "presentation",
      hidden: !mounted,
      style: {
        userSelect: "none",
        WebkitUserSelect: "none"
      }
    }, elementProps],
    enabled: forceRender || !nested
  });
});
const none = "none";
const triggerPress = "trigger-press";
const triggerHover = "trigger-hover";
const outsidePress = "outside-press";
const itemPress = "item-press";
const closePress = "close-press";
const focusOut = "focus-out";
const escapeKey = "escape-key";
const listNavigation = "list-navigation";
const cancelOpen = "cancel-open";
const imperativeAction = "imperative-action";
const windowResize = "window-resize";
function createChangeEventDetails(reason, event, trigger, customProperties) {
  let canceled = false;
  let allowPropagation = false;
  const custom = EMPTY_OBJECT;
  const details = {
    reason,
    event: event ?? new Event("base-ui"),
    cancel() {
      canceled = true;
    },
    allowPropagation() {
      allowPropagation = true;
    },
    get isCanceled() {
      return canceled;
    },
    get isPropagationAllowed() {
      return allowPropagation;
    },
    trigger,
    ...custom
  };
  return details;
}
const DialogClose = /* @__PURE__ */ reactExports.forwardRef(function DialogClose2(componentProps, forwardedRef) {
  const {
    render,
    className,
    disabled = false,
    nativeButton = true,
    ...elementProps
  } = componentProps;
  const {
    store
  } = useDialogRootContext();
  const open = store.useState("open");
  function handleClick(event) {
    if (open) {
      store.setOpen(false, createChangeEventDetails(closePress, event.nativeEvent));
    }
  }
  const {
    getButtonProps,
    buttonRef
  } = useButton({
    disabled,
    native: nativeButton
  });
  const state = reactExports.useMemo(() => ({
    disabled
  }), [disabled]);
  return useRenderElement("button", componentProps, {
    state,
    ref: [forwardedRef, buttonRef],
    props: [{
      onClick: handleClick
    }, elementProps, getButtonProps]
  });
});
function useBaseUiId(idOverride) {
  return useId(idOverride, "base-ui");
}
const DialogDescription = /* @__PURE__ */ reactExports.forwardRef(function DialogDescription2(componentProps, forwardedRef) {
  const {
    render,
    className,
    id: idProp,
    ...elementProps
  } = componentProps;
  const {
    store
  } = useDialogRootContext();
  const id = useBaseUiId(idProp);
  store.useSyncedValueWithCleanup("descriptionElementId", id);
  return useRenderElement("p", componentProps, {
    ref: forwardedRef,
    props: [{
      id
    }, elementProps]
  });
});
const FOCUSABLE_ATTRIBUTE = "data-base-ui-focusable";
const ACTIVE_KEY = "active";
const SELECTED_KEY = "selected";
const TYPEABLE_SELECTOR = "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])";
const ARROW_LEFT$1 = "ArrowLeft";
const ARROW_RIGHT$1 = "ArrowRight";
const ARROW_UP$1 = "ArrowUp";
const ARROW_DOWN$1 = "ArrowDown";
function activeElement(doc) {
  let element = doc.activeElement;
  while (element?.shadowRoot?.activeElement != null) {
    element = element.shadowRoot.activeElement;
  }
  return element;
}
function contains(parent, child) {
  if (!parent || !child) {
    return false;
  }
  const rootNode = child.getRootNode?.();
  if (parent.contains(child)) {
    return true;
  }
  if (rootNode && isShadowRoot(rootNode)) {
    let next = child;
    while (next) {
      if (parent === next) {
        return true;
      }
      next = next.parentNode || next.host;
    }
  }
  return false;
}
function getTarget(event) {
  if ("composedPath" in event) {
    return event.composedPath()[0];
  }
  return event.target;
}
function isEventTargetWithin(event, node) {
  if (node == null) {
    return false;
  }
  if ("composedPath" in event) {
    return event.composedPath().includes(node);
  }
  const eventAgain = event;
  return eventAgain.target != null && node.contains(eventAgain.target);
}
function isRootElement(element) {
  return element.matches("html,body");
}
function getDocument(node) {
  return node?.ownerDocument || document;
}
function isTypeableElement(element) {
  return isHTMLElement(element) && element.matches(TYPEABLE_SELECTOR);
}
function isTypeableCombobox(element) {
  if (!element) {
    return false;
  }
  return element.getAttribute("role") === "combobox" && isTypeableElement(element);
}
function getFloatingFocusElement(floatingElement) {
  if (!floatingElement) {
    return null;
  }
  return floatingElement.hasAttribute(FOCUSABLE_ATTRIBUTE) ? floatingElement : floatingElement.querySelector(`[${FOCUSABLE_ATTRIBUTE}]`) || floatingElement;
}
function getNodeChildren(nodes, id, onlyOpenChildren = true) {
  const directChildren = nodes.filter((node) => node.parentId === id && (!onlyOpenChildren || node.context?.open));
  return directChildren.flatMap((child) => [child, ...getNodeChildren(nodes, child.id, onlyOpenChildren)]);
}
function getNodeAncestors(nodes, id) {
  let allAncestors = [];
  let currentParentId = nodes.find((node) => node.id === id)?.parentId;
  while (currentParentId) {
    const currentNode = nodes.find((node) => node.id === currentParentId);
    currentParentId = currentNode?.parentId;
    if (currentNode) {
      allAncestors = allAncestors.concat(currentNode);
    }
  }
  return allAncestors;
}
function stopEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}
function isReactEvent(event) {
  return "nativeEvent" in event;
}
function isVirtualClick(event) {
  if (event.mozInputSource === 0 && event.isTrusted) {
    return true;
  }
  if (isAndroid && event.pointerType) {
    return event.type === "click" && event.buttons === 1;
  }
  return event.detail === 0 && !event.pointerType;
}
function isVirtualPointerEvent(event) {
  if (isJSDOM) {
    return false;
  }
  return !isAndroid && event.width === 0 && event.height === 0 || isAndroid && event.width === 1 && event.height === 1 && event.pressure === 0 && event.detail === 0 && event.pointerType === "mouse" || // iOS VoiceOver returns 0.333• for width/height.
  event.width < 1 && event.height < 1 && event.pressure === 0 && event.detail === 0 && event.pointerType === "touch";
}
function isMouseLikePointerType(pointerType, strict) {
  const values = ["mouse", "pen"];
  if (!strict) {
    values.push("", void 0);
  }
  return values.includes(pointerType);
}
function isClickLikeEvent(event) {
  const type = event.type;
  return type === "click" || type === "mousedown" || type === "keydown" || type === "keyup";
}
function isDifferentGridRow(index, cols, prevRow) {
  return Math.floor(index / cols) !== prevRow;
}
function isIndexOutOfListBounds(listRef, index) {
  return index < 0 || index >= listRef.current.length;
}
function getMinListIndex(listRef, disabledIndices) {
  return findNonDisabledListIndex(listRef, {
    disabledIndices
  });
}
function getMaxListIndex(listRef, disabledIndices) {
  return findNonDisabledListIndex(listRef, {
    decrement: true,
    startingIndex: listRef.current.length,
    disabledIndices
  });
}
function findNonDisabledListIndex(listRef, {
  startingIndex = -1,
  decrement = false,
  disabledIndices,
  amount = 1
} = {}) {
  let index = startingIndex;
  do {
    index += decrement ? -amount : amount;
  } while (index >= 0 && index <= listRef.current.length - 1 && isListIndexDisabled(listRef, index, disabledIndices));
  return index;
}
function getGridNavigatedIndex(listRef, {
  event,
  orientation,
  loopFocus,
  rtl,
  cols,
  disabledIndices,
  minIndex,
  maxIndex,
  prevIndex,
  stopEvent: stop = false
}) {
  let nextIndex = prevIndex;
  const rows = [];
  const rowIndexMap = {};
  let hasRoleRow = false;
  {
    let currentRowEl = null;
    let currentRowIndex = -1;
    listRef.current.forEach((el, idx) => {
      if (el == null) {
        return;
      }
      const rowEl = el.closest('[role="row"]');
      if (rowEl) {
        hasRoleRow = true;
      }
      if (rowEl !== currentRowEl || currentRowIndex === -1) {
        currentRowEl = rowEl;
        currentRowIndex += 1;
        rows[currentRowIndex] = [];
      }
      rows[currentRowIndex].push(idx);
      rowIndexMap[idx] = currentRowIndex;
    });
  }
  const hasDomRows = hasRoleRow && rows.length > 0 && rows.some((row) => row.length !== cols);
  function navigateVertically(direction) {
    if (!hasDomRows || prevIndex === -1) {
      return void 0;
    }
    const currentRow = rowIndexMap[prevIndex];
    if (currentRow == null) {
      return void 0;
    }
    const colInRow = rows[currentRow].indexOf(prevIndex);
    let nextRow = direction === "up" ? currentRow - 1 : currentRow + 1;
    if (loopFocus) {
      if (nextRow < 0) {
        nextRow = rows.length - 1;
      } else if (nextRow >= rows.length) {
        nextRow = 0;
      }
    }
    const visited = /* @__PURE__ */ new Set();
    while (nextRow >= 0 && nextRow < rows.length && !visited.has(nextRow)) {
      visited.add(nextRow);
      const targetRow = rows[nextRow];
      if (targetRow.length === 0) {
        nextRow = direction === "up" ? nextRow - 1 : nextRow + 1;
        continue;
      }
      const clampedCol = Math.min(colInRow, targetRow.length - 1);
      for (let col = clampedCol; col >= 0; col -= 1) {
        const candidate = targetRow[col];
        if (!isListIndexDisabled(listRef, candidate, disabledIndices)) {
          return candidate;
        }
      }
      nextRow = direction === "up" ? nextRow - 1 : nextRow + 1;
      if (loopFocus) {
        if (nextRow < 0) {
          nextRow = rows.length - 1;
        } else if (nextRow >= rows.length) {
          nextRow = 0;
        }
      }
    }
    return void 0;
  }
  if (event.key === ARROW_UP$1) {
    const domBasedCandidate = navigateVertically("up");
    if (domBasedCandidate !== void 0) {
      if (stop) {
        stopEvent(event);
      }
      nextIndex = domBasedCandidate;
    } else {
      if (stop) {
        stopEvent(event);
      }
      if (prevIndex === -1) {
        nextIndex = maxIndex;
      } else {
        nextIndex = findNonDisabledListIndex(listRef, {
          startingIndex: nextIndex,
          amount: cols,
          decrement: true,
          disabledIndices
        });
        if (loopFocus && (prevIndex - cols < minIndex || nextIndex < 0)) {
          const col = prevIndex % cols;
          const maxCol = maxIndex % cols;
          const offset2 = maxIndex - (maxCol - col);
          if (maxCol === col) {
            nextIndex = maxIndex;
          } else {
            nextIndex = maxCol > col ? offset2 : offset2 - cols;
          }
        }
      }
      if (isIndexOutOfListBounds(listRef, nextIndex)) {
        nextIndex = prevIndex;
      }
    }
  }
  if (event.key === ARROW_DOWN$1) {
    const domBasedCandidate = navigateVertically("down");
    if (domBasedCandidate !== void 0) {
      if (stop) {
        stopEvent(event);
      }
      nextIndex = domBasedCandidate;
    } else {
      if (stop) {
        stopEvent(event);
      }
      if (prevIndex === -1) {
        nextIndex = minIndex;
      } else {
        nextIndex = findNonDisabledListIndex(listRef, {
          startingIndex: prevIndex,
          amount: cols,
          disabledIndices
        });
        if (loopFocus && prevIndex + cols > maxIndex) {
          nextIndex = findNonDisabledListIndex(listRef, {
            startingIndex: prevIndex % cols - cols,
            amount: cols,
            disabledIndices
          });
        }
      }
      if (isIndexOutOfListBounds(listRef, nextIndex)) {
        nextIndex = prevIndex;
      }
    }
  }
  if (orientation === "both") {
    const prevRow = floor(prevIndex / cols);
    if (event.key === (rtl ? ARROW_LEFT$1 : ARROW_RIGHT$1)) {
      if (stop) {
        stopEvent(event);
      }
      if (prevIndex % cols !== cols - 1) {
        nextIndex = findNonDisabledListIndex(listRef, {
          startingIndex: prevIndex,
          disabledIndices
        });
        if (loopFocus && isDifferentGridRow(nextIndex, cols, prevRow)) {
          nextIndex = findNonDisabledListIndex(listRef, {
            startingIndex: prevIndex - prevIndex % cols - 1,
            disabledIndices
          });
        }
      } else if (loopFocus) {
        nextIndex = findNonDisabledListIndex(listRef, {
          startingIndex: prevIndex - prevIndex % cols - 1,
          disabledIndices
        });
      }
      if (isDifferentGridRow(nextIndex, cols, prevRow)) {
        nextIndex = prevIndex;
      }
    }
    if (event.key === (rtl ? ARROW_RIGHT$1 : ARROW_LEFT$1)) {
      if (stop) {
        stopEvent(event);
      }
      if (prevIndex % cols !== 0) {
        nextIndex = findNonDisabledListIndex(listRef, {
          startingIndex: prevIndex,
          decrement: true,
          disabledIndices
        });
        if (loopFocus && isDifferentGridRow(nextIndex, cols, prevRow)) {
          nextIndex = findNonDisabledListIndex(listRef, {
            startingIndex: prevIndex + (cols - prevIndex % cols),
            decrement: true,
            disabledIndices
          });
        }
      } else if (loopFocus) {
        nextIndex = findNonDisabledListIndex(listRef, {
          startingIndex: prevIndex + (cols - prevIndex % cols),
          decrement: true,
          disabledIndices
        });
      }
      if (isDifferentGridRow(nextIndex, cols, prevRow)) {
        nextIndex = prevIndex;
      }
    }
    const lastRow = floor(maxIndex / cols) === prevRow;
    if (isIndexOutOfListBounds(listRef, nextIndex)) {
      if (loopFocus && lastRow) {
        nextIndex = event.key === (rtl ? ARROW_RIGHT$1 : ARROW_LEFT$1) ? maxIndex : findNonDisabledListIndex(listRef, {
          startingIndex: prevIndex - prevIndex % cols - 1,
          disabledIndices
        });
      } else {
        nextIndex = prevIndex;
      }
    }
  }
  return nextIndex;
}
function createGridCellMap(sizes, cols, dense) {
  const cellMap = [];
  let startIndex = 0;
  sizes.forEach(({
    width,
    height
  }, index) => {
    let itemPlaced = false;
    if (dense) {
      startIndex = 0;
    }
    while (!itemPlaced) {
      const targetCells = [];
      for (let i = 0; i < width; i += 1) {
        for (let j = 0; j < height; j += 1) {
          targetCells.push(startIndex + i + j * cols);
        }
      }
      if (startIndex % cols + width <= cols && targetCells.every((cell) => cellMap[cell] == null)) {
        targetCells.forEach((cell) => {
          cellMap[cell] = index;
        });
        itemPlaced = true;
      } else {
        startIndex += 1;
      }
    }
  });
  return [...cellMap];
}
function getGridCellIndexOfCorner(index, sizes, cellMap, cols, corner) {
  if (index === -1) {
    return -1;
  }
  const firstCellIndex = cellMap.indexOf(index);
  const sizeItem = sizes[index];
  switch (corner) {
    case "tl":
      return firstCellIndex;
    case "tr":
      if (!sizeItem) {
        return firstCellIndex;
      }
      return firstCellIndex + sizeItem.width - 1;
    case "bl":
      if (!sizeItem) {
        return firstCellIndex;
      }
      return firstCellIndex + (sizeItem.height - 1) * cols;
    case "br":
      return cellMap.lastIndexOf(index);
    default:
      return -1;
  }
}
function getGridCellIndices(indices, cellMap) {
  return cellMap.flatMap((index, cellIndex) => indices.includes(index) ? [cellIndex] : []);
}
function isListIndexDisabled(listRef, index, disabledIndices) {
  if (typeof disabledIndices === "function") {
    return disabledIndices(index);
  }
  if (disabledIndices) {
    return disabledIndices.includes(index);
  }
  const element = listRef.current[index];
  if (!element) {
    return false;
  }
  return element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
}
const getTabbableOptions = () => ({
  getShadowRoot: true,
  displayCheck: (
    // JSDOM does not support the `tabbable` library. To solve this we can
    // check if `ResizeObserver` is a real function (not polyfilled), which
    // determines if the current environment is JSDOM-like.
    typeof ResizeObserver === "function" && ResizeObserver.toString().includes("[native code]") ? "full" : "none"
  )
});
function getTabbableIn(container, dir) {
  const list = tabbable(container, getTabbableOptions());
  const len = list.length;
  if (len === 0) {
    return void 0;
  }
  const active = activeElement(getDocument(container));
  const index = list.indexOf(active);
  const nextIndex = index === -1 ? dir === 1 ? 0 : len - 1 : index + dir;
  return list[nextIndex];
}
function getNextTabbable(referenceElement) {
  return getTabbableIn(getDocument(referenceElement).body, 1) || referenceElement;
}
function getPreviousTabbable(referenceElement) {
  return getTabbableIn(getDocument(referenceElement).body, -1) || referenceElement;
}
function getTabbableNearElement(referenceElement, dir) {
  if (!referenceElement) {
    return null;
  }
  const list = tabbable(getDocument(referenceElement).body, getTabbableOptions());
  const elementCount = list.length;
  if (elementCount === 0) {
    return null;
  }
  const index = list.indexOf(referenceElement);
  if (index === -1) {
    return null;
  }
  const nextIndex = (index + dir + elementCount) % elementCount;
  return list[nextIndex];
}
function getTabbableAfterElement(referenceElement) {
  return getTabbableNearElement(referenceElement, 1);
}
function getTabbableBeforeElement(referenceElement) {
  return getTabbableNearElement(referenceElement, -1);
}
function isOutsideEvent(event, container) {
  const containerElement = container || event.currentTarget;
  const relatedTarget = event.relatedTarget;
  return !relatedTarget || !contains(containerElement, relatedTarget);
}
function disableFocusInside(container) {
  const tabbableElements = tabbable(container, getTabbableOptions());
  tabbableElements.forEach((element) => {
    element.dataset.tabindex = element.getAttribute("tabindex") || "";
    element.setAttribute("tabindex", "-1");
  });
}
function enableFocusInside(container) {
  const elements = container.querySelectorAll("[data-tabindex]");
  elements.forEach((element) => {
    const tabindex = element.dataset.tabindex;
    delete element.dataset.tabindex;
    if (tabindex) {
      element.setAttribute("tabindex", tabindex);
    } else {
      element.removeAttribute("tabindex");
    }
  });
}
function createEventEmitter() {
  const map = /* @__PURE__ */ new Map();
  return {
    emit(event, data) {
      map.get(event)?.forEach((listener) => listener(data));
    },
    on(event, listener) {
      if (!map.has(event)) {
        map.set(event, /* @__PURE__ */ new Set());
      }
      map.get(event).add(listener);
    },
    off(event, listener) {
      map.get(event)?.delete(listener);
    }
  };
}
class FloatingTreeStore {
  nodesRef = {
    current: []
  };
  events = createEventEmitter();
  addNode(node) {
    this.nodesRef.current.push(node);
  }
  removeNode(node) {
    const index = this.nodesRef.current.findIndex((n) => n === node);
    if (index !== -1) {
      this.nodesRef.current.splice(index, 1);
    }
  }
}
const FloatingNodeContext = /* @__PURE__ */ reactExports.createContext(null);
const FloatingTreeContext = /* @__PURE__ */ reactExports.createContext(null);
const useFloatingParentNodeId = () => reactExports.useContext(FloatingNodeContext)?.id || null;
const useFloatingTree = (externalTree) => {
  const contextTree = reactExports.useContext(FloatingTreeContext);
  return externalTree ?? contextTree;
};
function useFloatingNodeId(externalTree) {
  const id = useId();
  const tree = useFloatingTree(externalTree);
  const parentId = useFloatingParentNodeId();
  useIsoLayoutEffect(() => {
    if (!id) {
      return void 0;
    }
    const node = {
      id,
      parentId
    };
    tree?.addNode(node);
    return () => {
      tree?.removeNode(node);
    };
  }, [tree, id, parentId]);
  return id;
}
function FloatingNode(props) {
  const {
    children,
    id
  } = props;
  const parentId = useFloatingParentNodeId();
  return /* @__PURE__ */ jsxRuntimeExports.jsx(FloatingNodeContext.Provider, {
    value: reactExports.useMemo(() => ({
      id,
      parentId
    }), [id, parentId]),
    children
  });
}
function FloatingTree(props) {
  const {
    children,
    externalTree
  } = props;
  const tree = useRefWithInit(() => externalTree ?? new FloatingTreeStore()).current;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(FloatingTreeContext.Provider, {
    value: tree,
    children
  });
}
function createAttribute(name) {
  return `data-base-ui-${name}`;
}
function getDelay$1(value, prop, pointerType) {
  if (pointerType && !isMouseLikePointerType(pointerType)) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "function") {
    const result = value();
    if (typeof result === "number") {
      return result;
    }
    return result?.[prop];
  }
  return value?.[prop];
}
const FocusGuard = /* @__PURE__ */ reactExports.forwardRef(function FocusGuard2(props, ref) {
  const [role, setRole] = reactExports.useState();
  useIsoLayoutEffect(() => {
    if (isSafari) {
      setRole("button");
    }
  }, []);
  const restProps = {
    tabIndex: 0,
    // Role is only for VoiceOver
    role
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", {
    ...props,
    ref,
    style: visuallyHidden,
    "aria-hidden": role ? void 0 : true,
    ...restProps,
    "data-base-ui-focus-guard": ""
  });
});
let rafId = 0;
function enqueueFocus(el, options = {}) {
  const {
    preventScroll = false,
    cancelPrevious = true,
    sync = false
  } = options;
  if (cancelPrevious) {
    cancelAnimationFrame(rafId);
  }
  const exec = () => el?.focus({
    preventScroll
  });
  if (sync) {
    exec();
  } else {
    rafId = requestAnimationFrame(exec);
  }
}
const counters = {
  inert: /* @__PURE__ */ new WeakMap(),
  "aria-hidden": /* @__PURE__ */ new WeakMap(),
  none: /* @__PURE__ */ new WeakMap()
};
function getCounterMap(control) {
  if (control === "inert") {
    return counters.inert;
  }
  if (control === "aria-hidden") {
    return counters["aria-hidden"];
  }
  return counters.none;
}
let uncontrolledElementsSet = /* @__PURE__ */ new WeakSet();
let markerMap = {};
let lockCount = 0;
const unwrapHost = (node) => node && (node.host || unwrapHost(node.parentNode));
const correctElements = (parent, targets) => targets.map((target) => {
  if (parent.contains(target)) {
    return target;
  }
  const correctedTarget = unwrapHost(target);
  if (parent.contains(correctedTarget)) {
    return correctedTarget;
  }
  return null;
}).filter((x) => x != null);
function applyAttributeToOthers(uncorrectedAvoidElements, body, ariaHidden, inert) {
  const markerName = "data-base-ui-inert";
  const controlAttribute = inert ? "inert" : ariaHidden ? "aria-hidden" : null;
  const avoidElements = correctElements(body, uncorrectedAvoidElements);
  const elementsToKeep = /* @__PURE__ */ new Set();
  const elementsToStop = new Set(avoidElements);
  const hiddenElements = [];
  if (!markerMap[markerName]) {
    markerMap[markerName] = /* @__PURE__ */ new WeakMap();
  }
  const markerCounter = markerMap[markerName];
  avoidElements.forEach(keep);
  deep(body);
  elementsToKeep.clear();
  function keep(el) {
    if (!el || elementsToKeep.has(el)) {
      return;
    }
    elementsToKeep.add(el);
    if (el.parentNode) {
      keep(el.parentNode);
    }
  }
  function deep(parent) {
    if (!parent || elementsToStop.has(parent)) {
      return;
    }
    [].forEach.call(parent.children, (node) => {
      if (getNodeName(node) === "script") {
        return;
      }
      if (elementsToKeep.has(node)) {
        deep(node);
      } else {
        const attr2 = controlAttribute ? node.getAttribute(controlAttribute) : null;
        const alreadyHidden = attr2 !== null && attr2 !== "false";
        const counterMap = getCounterMap(controlAttribute);
        const counterValue = (counterMap.get(node) || 0) + 1;
        const markerValue = (markerCounter.get(node) || 0) + 1;
        counterMap.set(node, counterValue);
        markerCounter.set(node, markerValue);
        hiddenElements.push(node);
        if (counterValue === 1 && alreadyHidden) {
          uncontrolledElementsSet.add(node);
        }
        if (markerValue === 1) {
          node.setAttribute(markerName, "");
        }
        if (!alreadyHidden && controlAttribute) {
          node.setAttribute(controlAttribute, controlAttribute === "inert" ? "" : "true");
        }
      }
    });
  }
  lockCount += 1;
  return () => {
    hiddenElements.forEach((element) => {
      const counterMap = getCounterMap(controlAttribute);
      const currentCounterValue = counterMap.get(element) || 0;
      const counterValue = currentCounterValue - 1;
      const markerValue = (markerCounter.get(element) || 0) - 1;
      counterMap.set(element, counterValue);
      markerCounter.set(element, markerValue);
      if (!counterValue) {
        if (!uncontrolledElementsSet.has(element) && controlAttribute) {
          element.removeAttribute(controlAttribute);
        }
        uncontrolledElementsSet.delete(element);
      }
      if (!markerValue) {
        element.removeAttribute(markerName);
      }
    });
    lockCount -= 1;
    if (!lockCount) {
      counters.inert = /* @__PURE__ */ new WeakMap();
      counters["aria-hidden"] = /* @__PURE__ */ new WeakMap();
      counters.none = /* @__PURE__ */ new WeakMap();
      uncontrolledElementsSet = /* @__PURE__ */ new WeakSet();
      markerMap = {};
    }
  };
}
function markOthers(avoidElements, ariaHidden = false, inert = false) {
  const body = getDocument(avoidElements[0]).body;
  return applyAttributeToOthers(avoidElements.concat(Array.from(body.querySelectorAll("[aria-live]"))), body, ariaHidden, inert);
}
const PortalContext = /* @__PURE__ */ reactExports.createContext(null);
const usePortalContext = () => reactExports.useContext(PortalContext);
const attr = createAttribute("portal");
function useFloatingPortalNode(props = {}) {
  const {
    ref,
    container: containerProp,
    componentProps = EMPTY_OBJECT,
    elementProps,
    elementState
  } = props;
  const uniqueId = useId();
  const portalContext = usePortalContext();
  const parentPortalNode = portalContext?.portalNode;
  const [containerElement, setContainerElement] = reactExports.useState(null);
  const [portalNode, setPortalNode] = reactExports.useState(null);
  const setPortalNodeRef = useStableCallback((node) => {
    if (node !== null) {
      setPortalNode(node);
    }
  });
  const containerRef = reactExports.useRef(null);
  useIsoLayoutEffect(() => {
    if (containerProp === null) {
      if (containerRef.current) {
        containerRef.current = null;
        setPortalNode(null);
        setContainerElement(null);
      }
      return;
    }
    if (uniqueId == null) {
      return;
    }
    const resolvedContainer = (containerProp && (isNode(containerProp) ? containerProp : containerProp.current)) ?? parentPortalNode ?? document.body;
    if (resolvedContainer == null) {
      if (containerRef.current) {
        containerRef.current = null;
        setPortalNode(null);
        setContainerElement(null);
      }
      return;
    }
    if (containerRef.current !== resolvedContainer) {
      containerRef.current = resolvedContainer;
      setPortalNode(null);
      setContainerElement(resolvedContainer);
    }
  }, [containerProp, parentPortalNode, uniqueId]);
  const portalElement = useRenderElement("div", componentProps, {
    ref: [ref, setPortalNodeRef],
    state: elementState,
    props: [{
      id: uniqueId,
      [attr]: ""
    }, elementProps]
  });
  const portalSubtree = containerElement && portalElement ? /* @__PURE__ */ reactDomExports.createPortal(portalElement, containerElement) : null;
  return {
    portalNode,
    portalSubtree
  };
}
const FloatingPortal = /* @__PURE__ */ reactExports.forwardRef(function FloatingPortal2(componentProps, forwardedRef) {
  const {
    children,
    container,
    className,
    render,
    renderGuards,
    ...elementProps
  } = componentProps;
  const {
    portalNode,
    portalSubtree
  } = useFloatingPortalNode({
    container,
    ref: forwardedRef,
    componentProps,
    elementProps
  });
  const beforeOutsideRef = reactExports.useRef(null);
  const afterOutsideRef = reactExports.useRef(null);
  const beforeInsideRef = reactExports.useRef(null);
  const afterInsideRef = reactExports.useRef(null);
  const [focusManagerState, setFocusManagerState] = reactExports.useState(null);
  const modal = focusManagerState?.modal;
  const open = focusManagerState?.open;
  const shouldRenderGuards = typeof renderGuards === "boolean" ? renderGuards : !!focusManagerState && !focusManagerState.modal && focusManagerState.open && !!portalNode;
  reactExports.useEffect(() => {
    if (!portalNode || modal) {
      return void 0;
    }
    function onFocus(event) {
      if (portalNode && event.relatedTarget && isOutsideEvent(event)) {
        const focusing = event.type === "focusin";
        const manageFocus = focusing ? enableFocusInside : disableFocusInside;
        manageFocus(portalNode);
      }
    }
    portalNode.addEventListener("focusin", onFocus, true);
    portalNode.addEventListener("focusout", onFocus, true);
    return () => {
      portalNode.removeEventListener("focusin", onFocus, true);
      portalNode.removeEventListener("focusout", onFocus, true);
    };
  }, [portalNode, modal]);
  reactExports.useEffect(() => {
    if (!portalNode || open) {
      return;
    }
    enableFocusInside(portalNode);
  }, [open, portalNode]);
  const portalContextValue = reactExports.useMemo(() => ({
    beforeOutsideRef,
    afterOutsideRef,
    beforeInsideRef,
    afterInsideRef,
    portalNode,
    setFocusManagerState
  }), [portalNode]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(reactExports.Fragment, {
    children: [portalSubtree, /* @__PURE__ */ jsxRuntimeExports.jsxs(PortalContext.Provider, {
      value: portalContextValue,
      children: [shouldRenderGuards && portalNode && /* @__PURE__ */ jsxRuntimeExports.jsx(FocusGuard, {
        "data-type": "outside",
        ref: beforeOutsideRef,
        onFocus: (event) => {
          if (isOutsideEvent(event, portalNode)) {
            beforeInsideRef.current?.focus();
          } else {
            const domReference = focusManagerState ? focusManagerState.domReference : null;
            const prevTabbable = getPreviousTabbable(domReference);
            prevTabbable?.focus();
          }
        }
      }), shouldRenderGuards && portalNode && /* @__PURE__ */ jsxRuntimeExports.jsx("span", {
        "aria-owns": portalNode.id,
        style: ownerVisuallyHidden
      }), portalNode && /* @__PURE__ */ reactDomExports.createPortal(children, portalNode), shouldRenderGuards && portalNode && /* @__PURE__ */ jsxRuntimeExports.jsx(FocusGuard, {
        "data-type": "outside",
        ref: afterOutsideRef,
        onFocus: (event) => {
          if (isOutsideEvent(event, portalNode)) {
            afterInsideRef.current?.focus();
          } else {
            const domReference = focusManagerState ? focusManagerState.domReference : null;
            const nextTabbable = getNextTabbable(domReference);
            nextTabbable?.focus();
            if (focusManagerState?.closeOnFocusOut) {
              focusManagerState?.onOpenChange(false, createChangeEventDetails(focusOut, event.nativeEvent));
            }
          }
        }
      })]
    })]
  });
});
function resolveRef(maybeRef) {
  if (maybeRef == null) {
    return maybeRef;
  }
  return "current" in maybeRef ? maybeRef.current : maybeRef;
}
function getEventType(event, lastInteractionType) {
  const win = getWindow(event.target);
  if (event instanceof win.KeyboardEvent) {
    return "keyboard";
  }
  if (event instanceof win.FocusEvent) {
    return lastInteractionType || "keyboard";
  }
  if ("pointerType" in event) {
    return event.pointerType || "keyboard";
  }
  if ("touches" in event) {
    return "touch";
  }
  if (event instanceof win.MouseEvent) {
    return lastInteractionType || (event.detail === 0 ? "keyboard" : "mouse");
  }
  return "";
}
const LIST_LIMIT = 20;
let previouslyFocusedElements = [];
function clearDisconnectedPreviouslyFocusedElements() {
  previouslyFocusedElements = previouslyFocusedElements.filter((el) => el.isConnected);
}
function addPreviouslyFocusedElement(element) {
  clearDisconnectedPreviouslyFocusedElements();
  if (element && getNodeName(element) !== "body") {
    previouslyFocusedElements.push(element);
    if (previouslyFocusedElements.length > LIST_LIMIT) {
      previouslyFocusedElements = previouslyFocusedElements.slice(-LIST_LIMIT);
    }
  }
}
function getPreviouslyFocusedElement() {
  clearDisconnectedPreviouslyFocusedElements();
  return previouslyFocusedElements[previouslyFocusedElements.length - 1];
}
function getFirstTabbableElement(container) {
  if (!container) {
    return null;
  }
  const tabbableOptions = getTabbableOptions();
  if (isTabbable(container, tabbableOptions)) {
    return container;
  }
  return tabbable(container, tabbableOptions)[0] || container;
}
function isFocusable(element) {
  if (!element || !element.isConnected) {
    return false;
  }
  if (typeof element.checkVisibility === "function") {
    return element.checkVisibility();
  }
  return getComputedStyle$1(element).display !== "none";
}
function handleTabIndex(floatingFocusElement, orderRef) {
  if (!orderRef.current.includes("floating") && !floatingFocusElement.getAttribute("role")?.includes("dialog")) {
    return;
  }
  const options = getTabbableOptions();
  const focusableElements = focusable(floatingFocusElement, options);
  const tabbableContent = focusableElements.filter((element) => {
    const dataTabIndex = element.getAttribute("data-tabindex") || "";
    return isTabbable(element, options) || element.hasAttribute("data-tabindex") && !dataTabIndex.startsWith("-");
  });
  const tabIndex = floatingFocusElement.getAttribute("tabindex");
  if (orderRef.current.includes("floating") || tabbableContent.length === 0) {
    if (tabIndex !== "0") {
      floatingFocusElement.setAttribute("tabindex", "0");
    }
  } else if (tabIndex !== "-1" || floatingFocusElement.hasAttribute("data-tabindex") && floatingFocusElement.getAttribute("data-tabindex") !== "-1") {
    floatingFocusElement.setAttribute("tabindex", "-1");
    floatingFocusElement.setAttribute("data-tabindex", "-1");
  }
}
function FloatingFocusManager(props) {
  const {
    context,
    children,
    disabled = false,
    order = ["content"],
    initialFocus = true,
    returnFocus = true,
    restoreFocus = false,
    modal = true,
    closeOnFocusOut = true,
    openInteractionType = "",
    getInsideElements: getInsideElementsProp = () => [],
    nextFocusableElement,
    previousFocusableElement,
    beforeContentFocusGuardRef,
    externalTree
  } = props;
  const store = "rootStore" in context ? context.rootStore : context;
  const open = store.useState("open");
  const domReference = store.useState("domReferenceElement");
  const floating = store.useState("floatingElement");
  const {
    events,
    dataRef
  } = store.context;
  const getNodeId = useStableCallback(() => dataRef.current.floatingContext?.nodeId);
  const getInsideElements = useStableCallback(getInsideElementsProp);
  const ignoreInitialFocus = initialFocus === false;
  const isUntrappedTypeableCombobox = isTypeableCombobox(domReference) && ignoreInitialFocus;
  const orderRef = useValueAsRef(order);
  const initialFocusRef = useValueAsRef(initialFocus);
  const returnFocusRef = useValueAsRef(returnFocus);
  const openInteractionTypeRef = useValueAsRef(openInteractionType);
  const tree = useFloatingTree(externalTree);
  const portalContext = usePortalContext();
  const startDismissButtonRef = reactExports.useRef(null);
  const endDismissButtonRef = reactExports.useRef(null);
  const preventReturnFocusRef = reactExports.useRef(false);
  const isPointerDownRef = reactExports.useRef(false);
  const pointerDownOutsideRef = reactExports.useRef(false);
  const tabbableIndexRef = reactExports.useRef(-1);
  const closeTypeRef = reactExports.useRef("");
  const lastInteractionTypeRef = reactExports.useRef("");
  const beforeGuardRef = reactExports.useRef(null);
  const afterGuardRef = reactExports.useRef(null);
  const mergedBeforeGuardRef = useMergedRefs(beforeGuardRef, beforeContentFocusGuardRef, portalContext?.beforeInsideRef);
  const mergedAfterGuardRef = useMergedRefs(afterGuardRef, portalContext?.afterInsideRef);
  const blurTimeout = useTimeout();
  const pointerDownTimeout = useTimeout();
  const restoreFocusFrame = useAnimationFrame();
  const isInsidePortal = portalContext != null;
  const floatingFocusElement = getFloatingFocusElement(floating);
  const getTabbableContent = useStableCallback((container = floatingFocusElement) => {
    return container ? tabbable(container, getTabbableOptions()) : [];
  });
  const getTabbableElements = useStableCallback((container) => {
    const content = getTabbableContent(container);
    return orderRef.current.map(() => content).filter(Boolean).flat();
  });
  reactExports.useEffect(() => {
    if (disabled) {
      return void 0;
    }
    if (!modal) {
      return void 0;
    }
    function onKeyDown(event) {
      if (event.key === "Tab") {
        if (contains(floatingFocusElement, activeElement(getDocument(floatingFocusElement))) && getTabbableContent().length === 0 && !isUntrappedTypeableCombobox) {
          stopEvent(event);
        }
      }
    }
    const doc = getDocument(floatingFocusElement);
    doc.addEventListener("keydown", onKeyDown);
    return () => {
      doc.removeEventListener("keydown", onKeyDown);
    };
  }, [disabled, domReference, floatingFocusElement, modal, orderRef, isUntrappedTypeableCombobox, getTabbableContent, getTabbableElements]);
  reactExports.useEffect(() => {
    if (disabled) {
      return void 0;
    }
    if (!floating) {
      return void 0;
    }
    function handleFocusIn(event) {
      const target = getTarget(event);
      const tabbableContent = getTabbableContent();
      const tabbableIndex = tabbableContent.indexOf(target);
      if (tabbableIndex !== -1) {
        tabbableIndexRef.current = tabbableIndex;
      }
    }
    floating.addEventListener("focusin", handleFocusIn);
    return () => {
      floating.removeEventListener("focusin", handleFocusIn);
    };
  }, [disabled, floating, getTabbableContent]);
  reactExports.useEffect(() => {
    if (disabled || !open) {
      return void 0;
    }
    const doc = getDocument(floatingFocusElement);
    function clearPointerDownOutside() {
      pointerDownOutsideRef.current = false;
    }
    function onPointerDown(event) {
      const target = getTarget(event);
      const pointerTargetInside = contains(floating, target) || contains(domReference, target) || contains(portalContext?.portalNode, target);
      pointerDownOutsideRef.current = !pointerTargetInside;
      lastInteractionTypeRef.current = event.pointerType || "keyboard";
    }
    function onKeyDown() {
      lastInteractionTypeRef.current = "keyboard";
    }
    doc.addEventListener("pointerdown", onPointerDown, true);
    doc.addEventListener("pointerup", clearPointerDownOutside, true);
    doc.addEventListener("pointercancel", clearPointerDownOutside, true);
    doc.addEventListener("keydown", onKeyDown, true);
    return () => {
      doc.removeEventListener("pointerdown", onPointerDown, true);
      doc.removeEventListener("pointerup", clearPointerDownOutside, true);
      doc.removeEventListener("pointercancel", clearPointerDownOutside, true);
      doc.removeEventListener("keydown", onKeyDown, true);
    };
  }, [disabled, floating, domReference, floatingFocusElement, open, portalContext]);
  reactExports.useEffect(() => {
    if (disabled) {
      return void 0;
    }
    if (!closeOnFocusOut) {
      return void 0;
    }
    function handlePointerDown() {
      isPointerDownRef.current = true;
      pointerDownTimeout.start(0, () => {
        isPointerDownRef.current = false;
      });
    }
    function handleFocusOutside(event) {
      const relatedTarget = event.relatedTarget;
      const currentTarget = event.currentTarget;
      const target = getTarget(event);
      queueMicrotask(() => {
        const nodeId = getNodeId();
        const triggers = store.context.triggerElements;
        const isRelatedFocusGuard = relatedTarget?.hasAttribute(createAttribute("focus-guard")) && [beforeGuardRef.current, afterGuardRef.current, portalContext?.beforeInsideRef.current, portalContext?.afterInsideRef.current, portalContext?.beforeOutsideRef.current, portalContext?.afterOutsideRef.current, resolveRef(previousFocusableElement), resolveRef(nextFocusableElement)].includes(relatedTarget);
        const movedToUnrelatedNode = !(contains(domReference, relatedTarget) || contains(floating, relatedTarget) || contains(relatedTarget, floating) || contains(portalContext?.portalNode, relatedTarget) || relatedTarget != null && triggers.hasElement(relatedTarget) || triggers.hasMatchingElement((trigger) => contains(trigger, relatedTarget)) || isRelatedFocusGuard || tree && (getNodeChildren(tree.nodesRef.current, nodeId).find((node) => contains(node.context?.elements.floating, relatedTarget) || contains(node.context?.elements.domReference, relatedTarget)) || getNodeAncestors(tree.nodesRef.current, nodeId).find((node) => [node.context?.elements.floating, getFloatingFocusElement(node.context?.elements.floating)].includes(relatedTarget) || node.context?.elements.domReference === relatedTarget)));
        if (currentTarget === domReference && floatingFocusElement) {
          handleTabIndex(floatingFocusElement, orderRef);
        }
        if (restoreFocus && currentTarget !== domReference && !isFocusable(target) && activeElement(getDocument(floatingFocusElement)) === getDocument(floatingFocusElement).body) {
          if (isHTMLElement(floatingFocusElement)) {
            floatingFocusElement.focus();
            if (restoreFocus === "popup") {
              restoreFocusFrame.request(() => {
                floatingFocusElement.focus();
              });
              return;
            }
          }
          const prevTabbableIndex = tabbableIndexRef.current;
          const tabbableContent = getTabbableContent();
          const nodeToFocus = tabbableContent[prevTabbableIndex] || tabbableContent[tabbableContent.length - 1] || floatingFocusElement;
          if (isHTMLElement(nodeToFocus)) {
            nodeToFocus.focus();
          }
        }
        if (dataRef.current.insideReactTree) {
          dataRef.current.insideReactTree = false;
          return;
        }
        if ((isUntrappedTypeableCombobox ? true : !modal) && relatedTarget && movedToUnrelatedNode && !isPointerDownRef.current && // Fix React 18 Strict Mode returnFocus due to double rendering.
        // For an "untrapped" typeable combobox (input role=combobox with
        // initialFocus=false), re-opening the popup and tabbing out should still close it even
        // when the previously focused element (e.g. the next tabbable outside the popup) is
        // focused again. Otherwise, the popup remains open on the second Tab sequence:
        // click input -> Tab (closes) -> click input -> Tab.
        // Allow closing when `isUntrappedTypeableCombobox` regardless of the previously focused element.
        (isUntrappedTypeableCombobox || relatedTarget !== getPreviouslyFocusedElement())) {
          preventReturnFocusRef.current = true;
          store.setOpen(false, createChangeEventDetails(focusOut, event));
        }
      });
    }
    function markInsideReactTree() {
      if (pointerDownOutsideRef.current) {
        return;
      }
      dataRef.current.insideReactTree = true;
      blurTimeout.start(0, () => {
        dataRef.current.insideReactTree = false;
      });
    }
    const domReferenceElement = isHTMLElement(domReference) ? domReference : null;
    const cleanups = [];
    if (!floating && !domReferenceElement) {
      return void 0;
    }
    if (domReferenceElement) {
      domReferenceElement.addEventListener("focusout", handleFocusOutside);
      domReferenceElement.addEventListener("pointerdown", handlePointerDown);
      cleanups.push(() => {
        domReferenceElement.removeEventListener("focusout", handleFocusOutside);
        domReferenceElement.removeEventListener("pointerdown", handlePointerDown);
      });
    }
    if (floating) {
      floating.addEventListener("focusout", handleFocusOutside);
      if (portalContext) {
        floating.addEventListener("focusout", markInsideReactTree, true);
        cleanups.push(() => {
          floating.removeEventListener("focusout", markInsideReactTree, true);
        });
      }
      cleanups.push(() => {
        floating.removeEventListener("focusout", handleFocusOutside);
      });
    }
    return () => {
      cleanups.forEach((cleanup) => {
        cleanup();
      });
    };
  }, [disabled, domReference, floating, floatingFocusElement, modal, tree, portalContext, store, closeOnFocusOut, restoreFocus, getTabbableContent, isUntrappedTypeableCombobox, getNodeId, orderRef, dataRef, blurTimeout, pointerDownTimeout, restoreFocusFrame, nextFocusableElement, previousFocusableElement]);
  reactExports.useEffect(() => {
    if (disabled || !floating || !open) {
      return void 0;
    }
    const portalNodes = Array.from(portalContext?.portalNode?.querySelectorAll(`[${createAttribute("portal")}]`) || []);
    const ancestors = tree ? getNodeAncestors(tree.nodesRef.current, getNodeId()) : [];
    const rootAncestorComboboxDomReference = ancestors.find((node) => isTypeableCombobox(node.context?.elements.domReference || null))?.context?.elements.domReference;
    const insideElements = [floating, rootAncestorComboboxDomReference, ...portalNodes, ...getInsideElements(), startDismissButtonRef.current, endDismissButtonRef.current, beforeGuardRef.current, afterGuardRef.current, portalContext?.beforeOutsideRef.current, portalContext?.afterOutsideRef.current, resolveRef(previousFocusableElement), resolveRef(nextFocusableElement), isUntrappedTypeableCombobox ? domReference : null].filter((x) => x != null);
    const cleanup = markOthers(insideElements, modal || isUntrappedTypeableCombobox);
    return () => {
      cleanup();
    };
  }, [open, disabled, domReference, floating, modal, orderRef, portalContext, isUntrappedTypeableCombobox, tree, getNodeId, getInsideElements, nextFocusableElement, previousFocusableElement]);
  useIsoLayoutEffect(() => {
    if (!open || disabled || !isHTMLElement(floatingFocusElement)) {
      return;
    }
    const doc = getDocument(floatingFocusElement);
    const previouslyFocusedElement = activeElement(doc);
    queueMicrotask(() => {
      const focusableElements = getTabbableElements(floatingFocusElement);
      const initialFocusValueOrFn = initialFocusRef.current;
      const resolvedInitialFocus = typeof initialFocusValueOrFn === "function" ? initialFocusValueOrFn(openInteractionTypeRef.current || "") : initialFocusValueOrFn;
      if (resolvedInitialFocus === void 0 || resolvedInitialFocus === false) {
        return;
      }
      let elToFocus;
      if (resolvedInitialFocus === true || resolvedInitialFocus === null) {
        elToFocus = focusableElements[0] || floatingFocusElement;
      } else {
        elToFocus = resolveRef(resolvedInitialFocus);
      }
      elToFocus = elToFocus || focusableElements[0] || floatingFocusElement;
      const focusAlreadyInsideFloatingEl = contains(floatingFocusElement, previouslyFocusedElement);
      if (focusAlreadyInsideFloatingEl) {
        return;
      }
      enqueueFocus(elToFocus, {
        preventScroll: elToFocus === floatingFocusElement
      });
    });
  }, [disabled, open, floatingFocusElement, ignoreInitialFocus, getTabbableElements, initialFocusRef, openInteractionTypeRef]);
  useIsoLayoutEffect(() => {
    if (disabled || !floatingFocusElement) {
      return void 0;
    }
    const doc = getDocument(floatingFocusElement);
    const previouslyFocusedElement = activeElement(doc);
    addPreviouslyFocusedElement(previouslyFocusedElement);
    function onOpenChangeLocal(details) {
      if (!details.open) {
        closeTypeRef.current = getEventType(details.nativeEvent, lastInteractionTypeRef.current);
      }
      if (details.reason === triggerHover && details.nativeEvent.type === "mouseleave") {
        preventReturnFocusRef.current = true;
      }
      if (details.reason !== outsidePress) {
        return;
      }
      if (details.nested) {
        preventReturnFocusRef.current = false;
      } else if (isVirtualClick(details.nativeEvent) || isVirtualPointerEvent(details.nativeEvent)) {
        preventReturnFocusRef.current = false;
      } else {
        let isPreventScrollSupported = false;
        document.createElement("div").focus({
          get preventScroll() {
            isPreventScrollSupported = true;
            return false;
          }
        });
        if (isPreventScrollSupported) {
          preventReturnFocusRef.current = false;
        } else {
          preventReturnFocusRef.current = true;
        }
      }
    }
    events.on("openchange", onOpenChangeLocal);
    const fallbackEl = doc.createElement("span");
    fallbackEl.setAttribute("tabindex", "-1");
    fallbackEl.setAttribute("aria-hidden", "true");
    Object.assign(fallbackEl.style, visuallyHidden);
    if (isInsidePortal && domReference) {
      domReference.insertAdjacentElement("afterend", fallbackEl);
    }
    function getReturnElement() {
      const returnFocusValueOrFn = returnFocusRef.current;
      let resolvedReturnFocusValue = typeof returnFocusValueOrFn === "function" ? returnFocusValueOrFn(closeTypeRef.current) : returnFocusValueOrFn;
      if (resolvedReturnFocusValue === void 0 || resolvedReturnFocusValue === false) {
        return null;
      }
      if (resolvedReturnFocusValue === null) {
        resolvedReturnFocusValue = true;
      }
      if (typeof resolvedReturnFocusValue === "boolean") {
        const el = domReference || getPreviouslyFocusedElement();
        return el && el.isConnected ? el : fallbackEl;
      }
      const fallback = domReference || getPreviouslyFocusedElement() || fallbackEl;
      return resolveRef(resolvedReturnFocusValue) || fallback;
    }
    return () => {
      events.off("openchange", onOpenChangeLocal);
      const activeEl = activeElement(doc);
      const isFocusInsideFloatingTree = contains(floating, activeEl) || tree && getNodeChildren(tree.nodesRef.current, getNodeId(), false).some((node) => contains(node.context?.elements.floating, activeEl));
      const returnElement = getReturnElement();
      queueMicrotask(() => {
        const tabbableReturnElement = getFirstTabbableElement(returnElement);
        const hasExplicitReturnFocus = typeof returnFocusRef.current !== "boolean";
        if (
          // eslint-disable-next-line react-hooks/exhaustive-deps
          returnFocusRef.current && !preventReturnFocusRef.current && isHTMLElement(tabbableReturnElement) && // If the focus moved somewhere else after mount, avoid returning focus
          // since it likely entered a different element which should be
          // respected: https://github.com/floating-ui/floating-ui/issues/2607
          (!hasExplicitReturnFocus && tabbableReturnElement !== activeEl && activeEl !== doc.body ? isFocusInsideFloatingTree : true)
        ) {
          tabbableReturnElement.focus({
            preventScroll: true
          });
        }
        fallbackEl.remove();
      });
    };
  }, [disabled, floating, floatingFocusElement, returnFocusRef, dataRef, events, tree, isInsidePortal, domReference, getNodeId]);
  reactExports.useEffect(() => {
    queueMicrotask(() => {
      preventReturnFocusRef.current = false;
    });
  }, [disabled]);
  reactExports.useEffect(() => {
    if (disabled || !open) {
      return void 0;
    }
    function handlePointerDown(event) {
      const target = getTarget(event);
      if (target?.closest(`[${CLICK_TRIGGER_IDENTIFIER}]`)) {
        isPointerDownRef.current = true;
      }
    }
    const doc = getDocument(floatingFocusElement);
    doc.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      doc.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [disabled, open, floatingFocusElement]);
  useIsoLayoutEffect(() => {
    if (disabled) {
      return void 0;
    }
    if (!portalContext) {
      return void 0;
    }
    portalContext.setFocusManagerState({
      modal,
      closeOnFocusOut,
      open,
      onOpenChange: store.setOpen,
      domReference
    });
    return () => {
      portalContext.setFocusManagerState(null);
    };
  }, [disabled, portalContext, modal, open, store, closeOnFocusOut, domReference]);
  useIsoLayoutEffect(() => {
    if (disabled || !floatingFocusElement) {
      return void 0;
    }
    handleTabIndex(floatingFocusElement, orderRef);
    return () => {
      queueMicrotask(clearDisconnectedPreviouslyFocusedElements);
    };
  }, [disabled, floatingFocusElement, orderRef]);
  const shouldRenderGuards = !disabled && (modal ? !isUntrappedTypeableCombobox : true) && (isInsidePortal || modal);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(reactExports.Fragment, {
    children: [shouldRenderGuards && /* @__PURE__ */ jsxRuntimeExports.jsx(FocusGuard, {
      "data-type": "inside",
      ref: mergedBeforeGuardRef,
      onFocus: (event) => {
        if (modal) {
          const els = getTabbableElements();
          enqueueFocus(els[els.length - 1]);
        } else if (portalContext?.portalNode) {
          preventReturnFocusRef.current = false;
          if (isOutsideEvent(event, portalContext.portalNode)) {
            const nextTabbable = getNextTabbable(domReference);
            nextTabbable?.focus();
          } else {
            resolveRef(previousFocusableElement ?? portalContext.beforeOutsideRef)?.focus();
          }
        }
      }
    }), children, shouldRenderGuards && /* @__PURE__ */ jsxRuntimeExports.jsx(FocusGuard, {
      "data-type": "inside",
      ref: mergedAfterGuardRef,
      onFocus: (event) => {
        if (modal) {
          enqueueFocus(getTabbableElements()[0]);
        } else if (portalContext?.portalNode) {
          if (closeOnFocusOut) {
            preventReturnFocusRef.current = true;
          }
          if (isOutsideEvent(event, portalContext.portalNode)) {
            const prevTabbable = getPreviousTabbable(domReference);
            prevTabbable?.focus();
          } else {
            resolveRef(nextFocusableElement ?? portalContext.afterOutsideRef)?.focus();
          }
        }
      }
    })]
  });
}
function useClick(context, props = {}) {
  const store = "rootStore" in context ? context.rootStore : context;
  const dataRef = store.context.dataRef;
  const {
    enabled = true,
    event: eventOption = "click",
    toggle = true,
    ignoreMouse = false,
    stickIfOpen = true,
    touchOpenDelay = 0
  } = props;
  const pointerTypeRef = reactExports.useRef(void 0);
  const frame = useAnimationFrame();
  const touchOpenTimeout = useTimeout();
  const reference = reactExports.useMemo(() => ({
    onPointerDown(event) {
      pointerTypeRef.current = event.pointerType;
    },
    onMouseDown(event) {
      const pointerType = pointerTypeRef.current;
      const nativeEvent = event.nativeEvent;
      const open = store.select("open");
      if (event.button !== 0 || eventOption === "click" || isMouseLikePointerType(pointerType, true) && ignoreMouse) {
        return;
      }
      const openEvent = dataRef.current.openEvent;
      const openEventType = openEvent?.type;
      const hasClickedOnInactiveTrigger = store.select("domReferenceElement") !== event.currentTarget;
      const nextOpen = open && hasClickedOnInactiveTrigger || !(open && toggle && (openEvent && stickIfOpen ? openEventType === "click" || openEventType === "mousedown" : true));
      if (isTypeableElement(nativeEvent.target)) {
        const details = createChangeEventDetails(triggerPress, nativeEvent, nativeEvent.target);
        if (nextOpen && pointerType === "touch" && touchOpenDelay > 0) {
          touchOpenTimeout.start(touchOpenDelay, () => {
            store.setOpen(true, details);
          });
        } else {
          store.setOpen(nextOpen, details);
        }
        return;
      }
      const eventCurrentTarget = event.currentTarget;
      frame.request(() => {
        const details = createChangeEventDetails(triggerPress, nativeEvent, eventCurrentTarget);
        if (nextOpen && pointerType === "touch" && touchOpenDelay > 0) {
          touchOpenTimeout.start(touchOpenDelay, () => {
            store.setOpen(true, details);
          });
        } else {
          store.setOpen(nextOpen, details);
        }
      });
    },
    onClick(event) {
      if (eventOption === "mousedown-only") {
        return;
      }
      const pointerType = pointerTypeRef.current;
      if (eventOption === "mousedown" && pointerType) {
        pointerTypeRef.current = void 0;
        return;
      }
      if (isMouseLikePointerType(pointerType, true) && ignoreMouse) {
        return;
      }
      const open = store.select("open");
      const openEvent = dataRef.current.openEvent;
      const hasClickedOnInactiveTrigger = store.select("domReferenceElement") !== event.currentTarget;
      const nextOpen = open && hasClickedOnInactiveTrigger || !(open && toggle && (openEvent && stickIfOpen ? isClickLikeEvent(openEvent) : true));
      const details = createChangeEventDetails(triggerPress, event.nativeEvent, event.currentTarget);
      if (nextOpen && pointerType === "touch" && touchOpenDelay > 0) {
        touchOpenTimeout.start(touchOpenDelay, () => {
          store.setOpen(true, details);
        });
      } else {
        store.setOpen(nextOpen, details);
      }
    },
    onKeyDown() {
      pointerTypeRef.current = void 0;
    }
  }), [dataRef, eventOption, ignoreMouse, store, stickIfOpen, toggle, frame, touchOpenTimeout, touchOpenDelay]);
  return reactExports.useMemo(() => enabled ? {
    reference
  } : EMPTY_OBJECT, [enabled, reference]);
}
const bubbleHandlerKeys = {
  intentional: "onClick",
  sloppy: "onPointerDown"
};
function normalizeProp(normalizable) {
  return {
    escapeKey: typeof normalizable === "boolean" ? normalizable : normalizable?.escapeKey ?? false,
    outsidePress: typeof normalizable === "boolean" ? normalizable : normalizable?.outsidePress ?? true
  };
}
function useDismiss(context, props = {}) {
  const store = "rootStore" in context ? context.rootStore : context;
  const open = store.useState("open");
  const floatingElement = store.useState("floatingElement");
  const referenceElement = store.useState("referenceElement");
  const domReferenceElement = store.useState("domReferenceElement");
  const {
    onOpenChange,
    dataRef
  } = store.context;
  const {
    enabled = true,
    escapeKey: escapeKey$1 = true,
    outsidePress: outsidePressProp = true,
    outsidePressEvent = "sloppy",
    referencePress = false,
    referencePressEvent = "sloppy",
    ancestorScroll = false,
    bubbles,
    externalTree
  } = props;
  const tree = useFloatingTree(externalTree);
  const outsidePressFn = useStableCallback(typeof outsidePressProp === "function" ? outsidePressProp : () => false);
  const outsidePress$1 = typeof outsidePressProp === "function" ? outsidePressFn : outsidePressProp;
  const endedOrStartedInsideRef = reactExports.useRef(false);
  const {
    escapeKey: escapeKeyBubbles,
    outsidePress: outsidePressBubbles
  } = normalizeProp(bubbles);
  const touchStateRef = reactExports.useRef(null);
  const cancelDismissOnEndTimeout = useTimeout();
  const clearInsideReactTreeTimeout = useTimeout();
  const clearInsideReactTree = useStableCallback(() => {
    clearInsideReactTreeTimeout.clear();
    dataRef.current.insideReactTree = false;
  });
  const isComposingRef = reactExports.useRef(false);
  const currentPointerTypeRef = reactExports.useRef("");
  const trackPointerType = useStableCallback((event) => {
    currentPointerTypeRef.current = event.pointerType;
  });
  const getOutsidePressEvent = useStableCallback(() => {
    const type = currentPointerTypeRef.current;
    const computedType = type === "pen" || !type ? "mouse" : type;
    const resolved = typeof outsidePressEvent === "function" ? outsidePressEvent() : outsidePressEvent;
    if (typeof resolved === "string") {
      return resolved;
    }
    return resolved[computedType];
  });
  const closeOnEscapeKeyDown = useStableCallback((event) => {
    if (!open || !enabled || !escapeKey$1 || event.key !== "Escape") {
      return;
    }
    if (isComposingRef.current) {
      return;
    }
    const nodeId = dataRef.current.floatingContext?.nodeId;
    const children = tree ? getNodeChildren(tree.nodesRef.current, nodeId) : [];
    if (!escapeKeyBubbles) {
      if (children.length > 0) {
        let shouldDismiss = true;
        children.forEach((child) => {
          if (child.context?.open && !child.context.dataRef.current.__escapeKeyBubbles) {
            shouldDismiss = false;
          }
        });
        if (!shouldDismiss) {
          return;
        }
      }
    }
    const native = isReactEvent(event) ? event.nativeEvent : event;
    const eventDetails = createChangeEventDetails(escapeKey, native);
    store.setOpen(false, eventDetails);
    if (!escapeKeyBubbles && !eventDetails.isPropagationAllowed) {
      event.stopPropagation();
    }
  });
  const shouldIgnoreEvent = useStableCallback((event) => {
    const computedOutsidePressEvent = getOutsidePressEvent();
    return computedOutsidePressEvent === "intentional" && event.type !== "click" || computedOutsidePressEvent === "sloppy" && event.type === "click";
  });
  const markInsideReactTree = useStableCallback(() => {
    dataRef.current.insideReactTree = true;
    clearInsideReactTreeTimeout.start(0, clearInsideReactTree);
  });
  const closeOnPressOutside = useStableCallback((event, endedOrStartedInside = false) => {
    if (shouldIgnoreEvent(event)) {
      clearInsideReactTree();
      return;
    }
    if (dataRef.current.insideReactTree) {
      clearInsideReactTree();
      return;
    }
    if (getOutsidePressEvent() === "intentional" && endedOrStartedInside) {
      return;
    }
    if (typeof outsidePress$1 === "function" && !outsidePress$1(event)) {
      return;
    }
    const target = getTarget(event);
    const inertSelector = `[${createAttribute("inert")}]`;
    const markers = getDocument(store.select("floatingElement")).querySelectorAll(inertSelector);
    const triggers = store.context.triggerElements;
    if (target && (triggers.hasElement(target) || triggers.hasMatchingElement((trigger) => contains(trigger, target)))) {
      return;
    }
    let targetRootAncestor = isElement(target) ? target : null;
    while (targetRootAncestor && !isLastTraversableNode(targetRootAncestor)) {
      const nextParent = getParentNode(targetRootAncestor);
      if (isLastTraversableNode(nextParent) || !isElement(nextParent)) {
        break;
      }
      targetRootAncestor = nextParent;
    }
    if (markers.length && isElement(target) && !isRootElement(target) && // Clicked on a direct ancestor (e.g. FloatingOverlay).
    !contains(target, store.select("floatingElement")) && // If the target root element contains none of the markers, then the
    // element was injected after the floating element rendered.
    Array.from(markers).every((marker) => !contains(targetRootAncestor, marker))) {
      return;
    }
    if (isHTMLElement(target) && !("touches" in event)) {
      const lastTraversableNode = isLastTraversableNode(target);
      const style = getComputedStyle$1(target);
      const scrollRe = /auto|scroll/;
      const isScrollableX = lastTraversableNode || scrollRe.test(style.overflowX);
      const isScrollableY = lastTraversableNode || scrollRe.test(style.overflowY);
      const canScrollX = isScrollableX && target.clientWidth > 0 && target.scrollWidth > target.clientWidth;
      const canScrollY = isScrollableY && target.clientHeight > 0 && target.scrollHeight > target.clientHeight;
      const isRTL = style.direction === "rtl";
      const pressedVerticalScrollbar = canScrollY && (isRTL ? event.offsetX <= target.offsetWidth - target.clientWidth : event.offsetX > target.clientWidth);
      const pressedHorizontalScrollbar = canScrollX && event.offsetY > target.clientHeight;
      if (pressedVerticalScrollbar || pressedHorizontalScrollbar) {
        return;
      }
    }
    const nodeId = dataRef.current.floatingContext?.nodeId;
    const targetIsInsideChildren = tree && getNodeChildren(tree.nodesRef.current, nodeId).some((node) => isEventTargetWithin(event, node.context?.elements.floating));
    if (isEventTargetWithin(event, store.select("floatingElement")) || isEventTargetWithin(event, store.select("domReferenceElement")) || targetIsInsideChildren) {
      return;
    }
    const children = tree ? getNodeChildren(tree.nodesRef.current, nodeId) : [];
    if (children.length > 0) {
      let shouldDismiss = true;
      children.forEach((child) => {
        if (child.context?.open && !child.context.dataRef.current.__outsidePressBubbles) {
          shouldDismiss = false;
        }
      });
      if (!shouldDismiss) {
        return;
      }
    }
    store.setOpen(false, createChangeEventDetails(outsidePress, event));
    clearInsideReactTree();
  });
  const handlePointerDown = useStableCallback((event) => {
    if (getOutsidePressEvent() !== "sloppy" || event.pointerType === "touch" || !store.select("open") || !enabled || isEventTargetWithin(event, store.select("floatingElement")) || isEventTargetWithin(event, store.select("domReferenceElement"))) {
      return;
    }
    closeOnPressOutside(event);
  });
  const handleTouchStart = useStableCallback((event) => {
    if (getOutsidePressEvent() !== "sloppy" || !store.select("open") || !enabled || isEventTargetWithin(event, store.select("floatingElement")) || isEventTargetWithin(event, store.select("domReferenceElement"))) {
      return;
    }
    const touch = event.touches[0];
    if (touch) {
      touchStateRef.current = {
        startTime: Date.now(),
        startX: touch.clientX,
        startY: touch.clientY,
        dismissOnTouchEnd: false,
        dismissOnMouseDown: true
      };
      cancelDismissOnEndTimeout.start(1e3, () => {
        if (touchStateRef.current) {
          touchStateRef.current.dismissOnTouchEnd = false;
          touchStateRef.current.dismissOnMouseDown = false;
        }
      });
    }
  });
  const handleTouchStartCapture = useStableCallback((event) => {
    const target = getTarget(event);
    function callback() {
      handleTouchStart(event);
      target?.removeEventListener(event.type, callback);
    }
    target?.addEventListener(event.type, callback);
  });
  const closeOnPressOutsideCapture = useStableCallback((event) => {
    const endedOrStartedInside = endedOrStartedInsideRef.current;
    endedOrStartedInsideRef.current = false;
    cancelDismissOnEndTimeout.clear();
    if (event.type === "mousedown" && touchStateRef.current && !touchStateRef.current.dismissOnMouseDown) {
      return;
    }
    const target = getTarget(event);
    function callback() {
      if (event.type === "pointerdown") {
        handlePointerDown(event);
      } else {
        closeOnPressOutside(event, endedOrStartedInside);
      }
      target?.removeEventListener(event.type, callback);
    }
    target?.addEventListener(event.type, callback);
  });
  const handleTouchMove = useStableCallback((event) => {
    if (getOutsidePressEvent() !== "sloppy" || !touchStateRef.current || isEventTargetWithin(event, store.select("floatingElement")) || isEventTargetWithin(event, store.select("domReferenceElement"))) {
      return;
    }
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    const deltaX = Math.abs(touch.clientX - touchStateRef.current.startX);
    const deltaY = Math.abs(touch.clientY - touchStateRef.current.startY);
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance > 5) {
      touchStateRef.current.dismissOnTouchEnd = true;
    }
    if (distance > 10) {
      closeOnPressOutside(event);
      cancelDismissOnEndTimeout.clear();
      touchStateRef.current = null;
    }
  });
  const handleTouchMoveCapture = useStableCallback((event) => {
    const target = getTarget(event);
    function callback() {
      handleTouchMove(event);
      target?.removeEventListener(event.type, callback);
    }
    target?.addEventListener(event.type, callback);
  });
  const handleTouchEnd = useStableCallback((event) => {
    if (getOutsidePressEvent() !== "sloppy" || !touchStateRef.current || isEventTargetWithin(event, store.select("floatingElement")) || isEventTargetWithin(event, store.select("domReferenceElement"))) {
      return;
    }
    if (touchStateRef.current.dismissOnTouchEnd) {
      closeOnPressOutside(event);
    }
    cancelDismissOnEndTimeout.clear();
    touchStateRef.current = null;
  });
  const handleTouchEndCapture = useStableCallback((event) => {
    const target = getTarget(event);
    function callback() {
      handleTouchEnd(event);
      target?.removeEventListener(event.type, callback);
    }
    target?.addEventListener(event.type, callback);
  });
  reactExports.useEffect(() => {
    if (!open || !enabled) {
      return void 0;
    }
    dataRef.current.__escapeKeyBubbles = escapeKeyBubbles;
    dataRef.current.__outsidePressBubbles = outsidePressBubbles;
    const compositionTimeout = new Timeout();
    function onScroll(event) {
      store.setOpen(false, createChangeEventDetails(none, event));
    }
    function handleCompositionStart() {
      compositionTimeout.clear();
      isComposingRef.current = true;
    }
    function handleCompositionEnd() {
      compositionTimeout.start(
        // 0ms or 1ms don't work in Safari. 5ms appears to consistently work.
        // Only apply to WebKit for the test to remain 0ms.
        isWebKit() ? 5 : 0,
        () => {
          isComposingRef.current = false;
        }
      );
    }
    const doc = getDocument(floatingElement);
    doc.addEventListener("pointerdown", trackPointerType, true);
    if (escapeKey$1) {
      doc.addEventListener("keydown", closeOnEscapeKeyDown);
      doc.addEventListener("compositionstart", handleCompositionStart);
      doc.addEventListener("compositionend", handleCompositionEnd);
    }
    if (outsidePress$1) {
      doc.addEventListener("click", closeOnPressOutsideCapture, true);
      doc.addEventListener("pointerdown", closeOnPressOutsideCapture, true);
      doc.addEventListener("touchstart", handleTouchStartCapture, true);
      doc.addEventListener("touchmove", handleTouchMoveCapture, true);
      doc.addEventListener("touchend", handleTouchEndCapture, true);
      doc.addEventListener("mousedown", closeOnPressOutsideCapture, true);
    }
    let ancestors = [];
    if (ancestorScroll) {
      if (isElement(domReferenceElement)) {
        ancestors = getOverflowAncestors(domReferenceElement);
      }
      if (isElement(floatingElement)) {
        ancestors = ancestors.concat(getOverflowAncestors(floatingElement));
      }
      if (!isElement(referenceElement) && referenceElement && referenceElement.contextElement) {
        ancestors = ancestors.concat(getOverflowAncestors(referenceElement.contextElement));
      }
    }
    ancestors = ancestors.filter((ancestor) => ancestor !== doc.defaultView?.visualViewport);
    ancestors.forEach((ancestor) => {
      ancestor.addEventListener("scroll", onScroll, {
        passive: true
      });
    });
    return () => {
      doc.removeEventListener("pointerdown", trackPointerType, true);
      if (escapeKey$1) {
        doc.removeEventListener("keydown", closeOnEscapeKeyDown);
        doc.removeEventListener("compositionstart", handleCompositionStart);
        doc.removeEventListener("compositionend", handleCompositionEnd);
      }
      if (outsidePress$1) {
        doc.removeEventListener("click", closeOnPressOutsideCapture, true);
        doc.removeEventListener("pointerdown", closeOnPressOutsideCapture, true);
        doc.removeEventListener("touchstart", handleTouchStartCapture, true);
        doc.removeEventListener("touchmove", handleTouchMoveCapture, true);
        doc.removeEventListener("touchend", handleTouchEndCapture, true);
        doc.removeEventListener("mousedown", closeOnPressOutsideCapture, true);
      }
      ancestors.forEach((ancestor) => {
        ancestor.removeEventListener("scroll", onScroll);
      });
      compositionTimeout.clear();
      endedOrStartedInsideRef.current = false;
    };
  }, [dataRef, floatingElement, referenceElement, domReferenceElement, escapeKey$1, outsidePress$1, open, onOpenChange, ancestorScroll, enabled, escapeKeyBubbles, outsidePressBubbles, closeOnEscapeKeyDown, closeOnPressOutside, closeOnPressOutsideCapture, handlePointerDown, handleTouchStartCapture, handleTouchMoveCapture, handleTouchEndCapture, trackPointerType, store]);
  reactExports.useEffect(clearInsideReactTree, [outsidePress$1, clearInsideReactTree]);
  const reference = reactExports.useMemo(() => ({
    onKeyDown: closeOnEscapeKeyDown,
    ...referencePress && {
      [bubbleHandlerKeys[referencePressEvent]]: (event) => {
        store.setOpen(false, createChangeEventDetails(triggerPress, event.nativeEvent));
      },
      ...referencePressEvent !== "intentional" && {
        onClick(event) {
          store.setOpen(false, createChangeEventDetails(triggerPress, event.nativeEvent));
        }
      }
    }
  }), [closeOnEscapeKeyDown, store, referencePress, referencePressEvent]);
  const handlePressedInside = useStableCallback((event) => {
    const target = getTarget(event.nativeEvent);
    if (!contains(store.select("floatingElement"), target) || event.button !== 0) {
      return;
    }
    endedOrStartedInsideRef.current = true;
  });
  const markPressStartedInsideReactTree = useStableCallback((event) => {
    if (!open || !enabled || event.button !== 0) {
      return;
    }
    endedOrStartedInsideRef.current = true;
  });
  const floating = reactExports.useMemo(() => ({
    onKeyDown: closeOnEscapeKeyDown,
    // `onMouseDown` may be blocked if `event.preventDefault()` is called in
    // `onPointerDown`, such as with <NumberField.ScrubArea>.
    // See https://github.com/mui/base-ui/pull/3379
    onPointerDown: handlePressedInside,
    onMouseDown: handlePressedInside,
    onMouseUp: handlePressedInside,
    onClickCapture: markInsideReactTree,
    onMouseDownCapture(event) {
      markInsideReactTree();
      markPressStartedInsideReactTree(event);
    },
    onPointerDownCapture(event) {
      markInsideReactTree();
      markPressStartedInsideReactTree(event);
    },
    onMouseUpCapture: markInsideReactTree,
    onTouchEndCapture: markInsideReactTree,
    onTouchMoveCapture: markInsideReactTree
  }), [closeOnEscapeKeyDown, handlePressedInside, markInsideReactTree, markPressStartedInsideReactTree]);
  return reactExports.useMemo(() => enabled ? {
    reference,
    floating,
    trigger: reference
  } : {}, [enabled, reference, floating]);
}
const selectors$3 = {
  open: createSelector((state) => state.open),
  domReferenceElement: createSelector((state) => state.domReferenceElement),
  referenceElement: createSelector((state) => state.positionReference ?? state.referenceElement),
  floatingElement: createSelector((state) => state.floatingElement),
  floatingId: createSelector((state) => state.floatingId)
};
class FloatingRootStore extends ReactStore {
  constructor(options) {
    const {
      nested,
      noEmit,
      onOpenChange,
      triggerElements,
      ...initialState
    } = options;
    super({
      ...initialState,
      positionReference: initialState.referenceElement,
      domReferenceElement: initialState.referenceElement
    }, {
      onOpenChange,
      dataRef: {
        current: {}
      },
      events: createEventEmitter(),
      nested,
      noEmit,
      triggerElements
    }, selectors$3);
  }
  /**
   * Emits the `openchange` event through the internal event emitter and calls the `onOpenChange` handler with the provided arguments.
   *
   * @param newOpen The new open state.
   * @param eventDetails Details about the event that triggered the open state change.
   */
  setOpen = (newOpen, eventDetails) => {
    if (!newOpen || !this.state.open || // Prevent a pending hover-open from overwriting a click-open event, while allowing
    // click events to upgrade a hover-open.
    isClickLikeEvent(eventDetails.event)) {
      this.context.dataRef.current.openEvent = newOpen ? eventDetails.event : void 0;
    }
    if (!this.context.noEmit) {
      const details = {
        open: newOpen,
        reason: eventDetails.reason,
        nativeEvent: eventDetails.event,
        nested: this.context.nested,
        triggerElement: eventDetails.trigger
      };
      this.context.events.emit("openchange", details);
    }
    this.context.onOpenChange?.(newOpen, eventDetails);
  };
}
function useTransitionStatus(open, enableIdleState = false, deferEndingState = false) {
  const [transitionStatus, setTransitionStatus] = reactExports.useState(open && enableIdleState ? "idle" : void 0);
  const [mounted, setMounted] = reactExports.useState(open);
  if (open && !mounted) {
    setMounted(true);
    setTransitionStatus("starting");
  }
  if (!open && mounted && transitionStatus !== "ending" && !deferEndingState) {
    setTransitionStatus("ending");
  }
  if (!open && !mounted && transitionStatus === "ending") {
    setTransitionStatus(void 0);
  }
  useIsoLayoutEffect(() => {
    if (!open && mounted && transitionStatus !== "ending" && deferEndingState) {
      const frame = AnimationFrame.request(() => {
        setTransitionStatus("ending");
      });
      return () => {
        AnimationFrame.cancel(frame);
      };
    }
    return void 0;
  }, [open, mounted, transitionStatus, deferEndingState]);
  useIsoLayoutEffect(() => {
    if (!open || enableIdleState) {
      return void 0;
    }
    const frame = AnimationFrame.request(() => {
      setTransitionStatus(void 0);
    });
    return () => {
      AnimationFrame.cancel(frame);
    };
  }, [enableIdleState, open]);
  useIsoLayoutEffect(() => {
    if (!open || !enableIdleState) {
      return void 0;
    }
    if (open && mounted && transitionStatus !== "idle") {
      setTransitionStatus("starting");
    }
    const frame = AnimationFrame.request(() => {
      setTransitionStatus("idle");
    });
    return () => {
      AnimationFrame.cancel(frame);
    };
  }, [enableIdleState, open, mounted, setTransitionStatus, transitionStatus]);
  return reactExports.useMemo(() => ({
    mounted,
    setMounted,
    transitionStatus
  }), [mounted, transitionStatus]);
}
function useAnimationsFinished(elementOrRef, waitForStartingStyleRemoved = false, treatAbortedAsFinished = true) {
  const frame = useAnimationFrame();
  return useStableCallback((fnToExecute, signal = null) => {
    frame.cancel();
    function done() {
      reactDomExports.flushSync(fnToExecute);
    }
    const element = resolveRef(elementOrRef);
    if (element == null) {
      return;
    }
    const resolvedElement = element;
    if (typeof resolvedElement.getAnimations !== "function" || globalThis.BASE_UI_ANIMATIONS_DISABLED) {
      fnToExecute();
    } else {
      let execWaitForStartingStyleRemoved = function() {
        const startingStyleAttribute = TransitionStatusDataAttributes.startingStyle;
        if (!resolvedElement.hasAttribute(startingStyleAttribute)) {
          frame.request(exec);
          return;
        }
        const attributeObserver = new MutationObserver(() => {
          if (!resolvedElement.hasAttribute(startingStyleAttribute)) {
            attributeObserver.disconnect();
            exec();
          }
        });
        attributeObserver.observe(resolvedElement, {
          attributes: true,
          attributeFilter: [startingStyleAttribute]
        });
        signal?.addEventListener("abort", () => attributeObserver.disconnect(), {
          once: true
        });
      }, exec = function() {
        Promise.all(resolvedElement.getAnimations().map((anim) => anim.finished)).then(() => {
          if (signal?.aborted) {
            return;
          }
          done();
        }).catch(() => {
          const currentAnimations = resolvedElement.getAnimations();
          if (treatAbortedAsFinished) {
            if (signal?.aborted) {
              return;
            }
            done();
          } else if (currentAnimations.length > 0 && currentAnimations.some((anim) => anim.pending || anim.playState !== "finished")) {
            exec();
          }
        });
      };
      if (waitForStartingStyleRemoved) {
        execWaitForStartingStyleRemoved();
        return;
      }
      frame.request(exec);
    }
  });
}
function useOpenChangeComplete(parameters) {
  const {
    enabled = true,
    open,
    ref,
    onComplete: onCompleteParam
  } = parameters;
  const onComplete = useStableCallback(onCompleteParam);
  const runOnceAnimationsFinish = useAnimationsFinished(ref, open, false);
  reactExports.useEffect(() => {
    if (!enabled) {
      return void 0;
    }
    const abortController = new AbortController();
    runOnceAnimationsFinish(onComplete, abortController.signal);
    return () => {
      abortController.abort();
    };
  }, [enabled, open, onComplete, runOnceAnimationsFinish]);
}
function useTriggerRegistration(id, store) {
  const registeredElementIdRef = reactExports.useRef(null);
  const registeredElementRef = reactExports.useRef(null);
  return reactExports.useCallback((element) => {
    if (id === void 0) {
      return;
    }
    if (registeredElementIdRef.current !== null) {
      const registeredId = registeredElementIdRef.current;
      const registeredElement = registeredElementRef.current;
      const currentElement = store.context.triggerElements.getById(registeredId);
      if (registeredElement && currentElement === registeredElement) {
        store.context.triggerElements.delete(registeredId);
      }
      registeredElementIdRef.current = null;
      registeredElementRef.current = null;
    }
    if (element !== null) {
      registeredElementIdRef.current = id;
      registeredElementRef.current = element;
      store.context.triggerElements.add(id, element);
    }
  }, [store, id]);
}
function useTriggerDataForwarding(triggerId, triggerElementRef, store, stateUpdates) {
  const isMountedByThisTrigger = store.useState("isMountedByTrigger", triggerId);
  const baseRegisterTrigger = useTriggerRegistration(triggerId, store);
  const registerTrigger = useStableCallback((element) => {
    baseRegisterTrigger(element);
    if (!element || !store.select("open")) {
      return;
    }
    const activeTriggerId = store.select("activeTriggerId");
    if (activeTriggerId === triggerId) {
      store.update({
        activeTriggerElement: element,
        ...stateUpdates
      });
      return;
    }
    if (activeTriggerId == null) {
      store.update({
        activeTriggerId: triggerId,
        activeTriggerElement: element,
        ...stateUpdates
      });
    }
  });
  useIsoLayoutEffect(() => {
    if (isMountedByThisTrigger) {
      store.update({
        activeTriggerElement: triggerElementRef.current,
        ...stateUpdates
      });
    }
  }, [isMountedByThisTrigger, store, triggerElementRef, ...Object.values(stateUpdates)]);
  return {
    registerTrigger,
    isMountedByThisTrigger
  };
}
function useImplicitActiveTrigger(store) {
  const open = store.useState("open");
  useIsoLayoutEffect(() => {
    if (open && !store.select("activeTriggerId") && store.context.triggerElements.size === 1) {
      const iteratorResult = store.context.triggerElements.entries().next();
      if (!iteratorResult.done) {
        const [implicitTriggerId, implicitTriggerElement] = iteratorResult.value;
        store.update({
          activeTriggerId: implicitTriggerId,
          activeTriggerElement: implicitTriggerElement
        });
      }
    }
  }, [open, store]);
}
function useOpenStateTransitions(open, store, onUnmount) {
  const {
    mounted,
    setMounted,
    transitionStatus
  } = useTransitionStatus(open);
  store.useSyncedValues({
    mounted,
    transitionStatus
  });
  const forceUnmount = useStableCallback(() => {
    setMounted(false);
    store.update({
      activeTriggerId: null,
      activeTriggerElement: null,
      mounted: false
    });
    onUnmount?.();
    store.context.onOpenChangeComplete?.(false);
  });
  const preventUnmountingOnClose = store.useState("preventUnmountingOnClose");
  useOpenChangeComplete({
    enabled: !preventUnmountingOnClose,
    open,
    ref: store.context.popupRef,
    onComplete() {
      if (!open) {
        forceUnmount();
      }
    }
  });
  return {
    forceUnmount,
    transitionStatus
  };
}
class PopupTriggerMap {
  constructor() {
    this.elements = /* @__PURE__ */ new Set();
    this.idMap = /* @__PURE__ */ new Map();
  }
  /**
   * Adds a trigger element with the given ID.
   *
   * Note: The provided element is assumed to not be registered under multiple IDs.
   */
  add(id, element) {
    const existingElement = this.idMap.get(id);
    if (existingElement === element) {
      return;
    }
    if (existingElement !== void 0) {
      this.elements.delete(existingElement);
    }
    this.elements.add(element);
    this.idMap.set(id, element);
  }
  /**
   * Removes the trigger element with the given ID.
   */
  delete(id) {
    const element = this.idMap.get(id);
    if (element) {
      this.elements.delete(element);
      this.idMap.delete(id);
    }
  }
  /**
   * Whether the given element is registered as a trigger.
   */
  hasElement(element) {
    return this.elements.has(element);
  }
  /**
   * Whether there is a registered trigger element matching the given predicate.
   */
  hasMatchingElement(predicate) {
    for (const element of this.elements) {
      if (predicate(element)) {
        return true;
      }
    }
    return false;
  }
  getById(id) {
    return this.idMap.get(id);
  }
  entries() {
    return this.idMap.entries();
  }
  get size() {
    return this.idMap.size;
  }
}
function getEmptyRootContext() {
  return new FloatingRootStore({
    open: false,
    floatingElement: null,
    referenceElement: null,
    triggerElements: new PopupTriggerMap(),
    floatingId: "",
    nested: false,
    noEmit: false,
    onOpenChange: void 0
  });
}
function createInitialPopupStoreState() {
  return {
    open: false,
    mounted: false,
    transitionStatus: "idle",
    floatingRootContext: getEmptyRootContext(),
    preventUnmountingOnClose: false,
    payload: void 0,
    activeTriggerId: null,
    activeTriggerElement: null,
    popupElement: null,
    positionerElement: null,
    activeTriggerProps: EMPTY_OBJECT,
    inactiveTriggerProps: EMPTY_OBJECT,
    popupProps: EMPTY_OBJECT
  };
}
const popupStoreSelectors = {
  open: createSelector((state) => state.open),
  mounted: createSelector((state) => state.mounted),
  transitionStatus: createSelector((state) => state.transitionStatus),
  floatingRootContext: createSelector((state) => state.floatingRootContext),
  preventUnmountingOnClose: createSelector((state) => state.preventUnmountingOnClose),
  payload: createSelector((state) => state.payload),
  activeTriggerId: createSelector((state) => state.activeTriggerId),
  activeTriggerElement: createSelector((state) => state.mounted ? state.activeTriggerElement : null),
  /**
   * Whether the trigger with the given ID was used to open the popup.
   */
  isTriggerActive: createSelector((state, triggerId) => triggerId !== void 0 && state.activeTriggerId === triggerId),
  /**
   * Whether the popup is open and was activated by a trigger with the given ID.
   */
  isOpenedByTrigger: createSelector((state, triggerId) => triggerId !== void 0 && state.activeTriggerId === triggerId && state.open),
  /**
   * Whether the popup is mounted and was activated by a trigger with the given ID.
   */
  isMountedByTrigger: createSelector((state, triggerId) => triggerId !== void 0 && state.activeTriggerId === triggerId && state.mounted),
  triggerProps: createSelector((state, isActive) => isActive ? state.activeTriggerProps : state.inactiveTriggerProps),
  popupProps: createSelector((state) => state.popupProps),
  popupElement: createSelector((state) => state.popupElement),
  positionerElement: createSelector((state) => state.positionerElement)
};
function useFloatingRootContext(options) {
  const {
    open = false,
    onOpenChange,
    elements = {}
  } = options;
  const floatingId = useId();
  const nested = useFloatingParentNodeId() != null;
  const store = useRefWithInit(() => new FloatingRootStore({
    open,
    onOpenChange,
    referenceElement: elements.reference ?? null,
    floatingElement: elements.floating ?? null,
    triggerElements: elements.triggers ?? new PopupTriggerMap(),
    floatingId,
    nested,
    noEmit: options.noEmit || false
  })).current;
  useIsoLayoutEffect(() => {
    const valuesToSync = {
      open,
      floatingId
    };
    if (elements.reference !== void 0) {
      valuesToSync.referenceElement = elements.reference;
      valuesToSync.domReferenceElement = isElement(elements.reference) ? elements.reference : null;
    }
    if (elements.floating !== void 0) {
      valuesToSync.floatingElement = elements.floating;
    }
    store.update(valuesToSync);
  }, [open, floatingId, elements.reference, elements.floating, store]);
  store.context.onOpenChange = onOpenChange;
  store.context.nested = nested;
  store.context.noEmit = options.noEmit || false;
  return store;
}
function useFloating(options = {}) {
  const {
    nodeId,
    externalTree
  } = options;
  const internalRootStore = useFloatingRootContext(options);
  const rootContext = options.rootContext || internalRootStore;
  const rootContextElements = {
    reference: rootContext.useState("referenceElement"),
    floating: rootContext.useState("floatingElement"),
    domReference: rootContext.useState("domReferenceElement")
  };
  const [positionReference, setPositionReferenceRaw] = reactExports.useState(null);
  const domReferenceRef = reactExports.useRef(null);
  const tree = useFloatingTree(externalTree);
  useIsoLayoutEffect(() => {
    if (rootContextElements.domReference) {
      domReferenceRef.current = rootContextElements.domReference;
    }
  }, [rootContextElements.domReference]);
  const position = useFloating$1({
    ...options,
    elements: {
      ...rootContextElements,
      ...positionReference && {
        reference: positionReference
      }
    }
  });
  const setPositionReference = reactExports.useCallback((node) => {
    const computedPositionReference = isElement(node) ? {
      getBoundingClientRect: () => node.getBoundingClientRect(),
      getClientRects: () => node.getClientRects(),
      contextElement: node
    } : node;
    setPositionReferenceRaw(computedPositionReference);
    position.refs.setReference(computedPositionReference);
  }, [position.refs]);
  const [localDomReference, setLocalDomReference] = reactExports.useState(null);
  const [localFloatingElement, setLocalFloatingElement] = reactExports.useState(null);
  rootContext.useSyncedValue("referenceElement", localDomReference);
  rootContext.useSyncedValue("domReferenceElement", isElement(localDomReference) ? localDomReference : null);
  rootContext.useSyncedValue("floatingElement", localFloatingElement);
  const setReference = reactExports.useCallback((node) => {
    if (isElement(node) || node === null) {
      domReferenceRef.current = node;
      setLocalDomReference(node);
    }
    if (isElement(position.refs.reference.current) || position.refs.reference.current === null || // Don't allow setting virtual elements using the old technique back to
    // `null` to support `positionReference` + an unstable `reference`
    // callback ref.
    node !== null && !isElement(node)) {
      position.refs.setReference(node);
    }
  }, [position.refs, setLocalDomReference]);
  const setFloating = reactExports.useCallback((node) => {
    setLocalFloatingElement(node);
    position.refs.setFloating(node);
  }, [position.refs]);
  const refs = reactExports.useMemo(() => ({
    ...position.refs,
    setReference,
    setFloating,
    setPositionReference,
    domReference: domReferenceRef
  }), [position.refs, setReference, setFloating, setPositionReference]);
  const elements = reactExports.useMemo(() => ({
    ...position.elements,
    domReference: rootContextElements.domReference
  }), [position.elements, rootContextElements.domReference]);
  const open = rootContext.useState("open");
  const floatingId = rootContext.useState("floatingId");
  const context = reactExports.useMemo(() => ({
    ...position,
    dataRef: rootContext.context.dataRef,
    open,
    onOpenChange: rootContext.setOpen,
    events: rootContext.context.events,
    floatingId,
    refs,
    elements,
    nodeId,
    rootStore: rootContext
  }), [position, refs, elements, nodeId, rootContext, open, floatingId]);
  useIsoLayoutEffect(() => {
    rootContext.context.dataRef.current.floatingContext = context;
    const node = tree?.nodesRef.current.find((n) => n.id === nodeId);
    if (node) {
      node.context = context;
    }
  });
  return reactExports.useMemo(() => ({
    ...position,
    context,
    refs,
    elements,
    rootStore: rootContext
  }), [position, refs, elements, context, rootContext]);
}
function useSyncedFloatingRootContext(options) {
  const {
    popupStore,
    noEmit = false,
    treatPopupAsFloatingElement = false,
    onOpenChange
  } = options;
  const floatingId = useId();
  const nested = useFloatingParentNodeId() != null;
  const open = popupStore.useState("open");
  const referenceElement = popupStore.useState("activeTriggerElement");
  const floatingElement = popupStore.useState(treatPopupAsFloatingElement ? "popupElement" : "positionerElement");
  const triggerElements = popupStore.context.triggerElements;
  const store = useRefWithInit(() => new FloatingRootStore({
    open,
    referenceElement,
    floatingElement,
    triggerElements,
    onOpenChange,
    floatingId,
    nested,
    noEmit
  })).current;
  useIsoLayoutEffect(() => {
    const valuesToSync = {
      open,
      floatingId,
      referenceElement,
      floatingElement
    };
    if (isElement(referenceElement)) {
      valuesToSync.domReferenceElement = referenceElement;
    }
    if (store.state.positionReference === store.state.referenceElement) {
      valuesToSync.positionReference = referenceElement;
    }
    store.update(valuesToSync);
  }, [open, floatingId, referenceElement, floatingElement, store]);
  store.context.onOpenChange = onOpenChange;
  store.context.nested = nested;
  store.context.noEmit = noEmit;
  return store;
}
const safePolygonIdentifier = createAttribute("safe-polygon");
const interactiveSelector = `button,a,[role="button"],select,[tabindex]:not([tabindex="-1"]),${TYPEABLE_SELECTOR}`;
function isInteractiveElement(element) {
  return element ? Boolean(element.closest(interactiveSelector)) : false;
}
function useHoverInteractionSharedState(store) {
  const pointerTypeRef = reactExports.useRef(void 0);
  const interactedInsideRef = reactExports.useRef(false);
  const handlerRef = reactExports.useRef(void 0);
  const blockMouseMoveRef = reactExports.useRef(true);
  const performedPointerEventsMutationRef = reactExports.useRef(false);
  const unbindMouseMoveRef = reactExports.useRef(() => {
  });
  const restTimeoutPendingRef = reactExports.useRef(false);
  const openChangeTimeout = useTimeout();
  const restTimeout = useTimeout();
  const handleCloseOptionsRef = reactExports.useRef(void 0);
  return reactExports.useMemo(() => {
    const data = store.context.dataRef.current;
    if (!data.hoverInteractionState) {
      data.hoverInteractionState = {
        pointerTypeRef,
        interactedInsideRef,
        handlerRef,
        blockMouseMoveRef,
        performedPointerEventsMutationRef,
        unbindMouseMoveRef,
        restTimeoutPendingRef,
        openChangeTimeout,
        restTimeout,
        handleCloseOptionsRef
      };
    }
    return data.hoverInteractionState;
  }, [store, pointerTypeRef, interactedInsideRef, handlerRef, blockMouseMoveRef, performedPointerEventsMutationRef, unbindMouseMoveRef, restTimeoutPendingRef, openChangeTimeout, restTimeout, handleCloseOptionsRef]);
}
const clickLikeEvents = /* @__PURE__ */ new Set(["click", "mousedown"]);
function useHoverFloatingInteraction(context, parameters = {}) {
  const store = "rootStore" in context ? context.rootStore : context;
  const open = store.useState("open");
  const floatingElement = store.useState("floatingElement");
  const domReferenceElement = store.useState("domReferenceElement");
  const {
    dataRef
  } = store.context;
  const {
    enabled = true,
    closeDelay: closeDelayProp = 0,
    externalTree
  } = parameters;
  const {
    pointerTypeRef,
    interactedInsideRef,
    handlerRef,
    performedPointerEventsMutationRef,
    unbindMouseMoveRef,
    restTimeoutPendingRef,
    openChangeTimeout,
    handleCloseOptionsRef
  } = useHoverInteractionSharedState(store);
  const tree = useFloatingTree(externalTree);
  const parentId = useFloatingParentNodeId();
  const isClickLikeOpenEvent = useStableCallback(() => {
    if (interactedInsideRef.current) {
      return true;
    }
    return dataRef.current.openEvent ? clickLikeEvents.has(dataRef.current.openEvent.type) : false;
  });
  const isHoverOpen = useStableCallback(() => {
    const type = dataRef.current.openEvent?.type;
    return type?.includes("mouse") && type !== "mousedown";
  });
  const closeWithDelay = reactExports.useCallback((event, runElseBranch = true) => {
    const closeDelay = getDelay(closeDelayProp, pointerTypeRef.current);
    if (closeDelay && !handlerRef.current) {
      openChangeTimeout.start(closeDelay, () => store.setOpen(false, createChangeEventDetails(triggerHover, event)));
    } else if (runElseBranch) {
      openChangeTimeout.clear();
      store.setOpen(false, createChangeEventDetails(triggerHover, event));
    }
  }, [closeDelayProp, handlerRef, store, pointerTypeRef, openChangeTimeout]);
  const cleanupMouseMoveHandler = useStableCallback(() => {
    unbindMouseMoveRef.current();
    handlerRef.current = void 0;
  });
  const clearPointerEvents = useStableCallback(() => {
    if (performedPointerEventsMutationRef.current) {
      const body = getDocument(floatingElement).body;
      body.style.pointerEvents = "";
      body.removeAttribute(safePolygonIdentifier);
      performedPointerEventsMutationRef.current = false;
    }
  });
  const handleInteractInside = useStableCallback((event) => {
    const target = getTarget(event);
    if (!isInteractiveElement(target)) {
      interactedInsideRef.current = false;
      return;
    }
    interactedInsideRef.current = true;
  });
  useIsoLayoutEffect(() => {
    if (!open) {
      pointerTypeRef.current = void 0;
      restTimeoutPendingRef.current = false;
      interactedInsideRef.current = false;
      cleanupMouseMoveHandler();
      clearPointerEvents();
    }
  }, [open, pointerTypeRef, restTimeoutPendingRef, interactedInsideRef, cleanupMouseMoveHandler, clearPointerEvents]);
  reactExports.useEffect(() => {
    return () => {
      cleanupMouseMoveHandler();
    };
  }, [cleanupMouseMoveHandler]);
  reactExports.useEffect(() => {
    return clearPointerEvents;
  }, [clearPointerEvents]);
  useIsoLayoutEffect(() => {
    if (!enabled) {
      return void 0;
    }
    if (open && handleCloseOptionsRef.current?.blockPointerEvents && isHoverOpen() && isElement(domReferenceElement) && floatingElement) {
      performedPointerEventsMutationRef.current = true;
      const body = getDocument(floatingElement).body;
      body.setAttribute(safePolygonIdentifier, "");
      const ref = domReferenceElement;
      const floatingEl = floatingElement;
      const parentFloating = tree?.nodesRef.current.find((node) => node.id === parentId)?.context?.elements.floating;
      if (parentFloating) {
        parentFloating.style.pointerEvents = "";
      }
      body.style.pointerEvents = "none";
      ref.style.pointerEvents = "auto";
      floatingEl.style.pointerEvents = "auto";
      return () => {
        body.style.pointerEvents = "";
        ref.style.pointerEvents = "";
        floatingEl.style.pointerEvents = "";
      };
    }
    return void 0;
  }, [enabled, open, domReferenceElement, floatingElement, handleCloseOptionsRef, isHoverOpen, tree, parentId, performedPointerEventsMutationRef]);
  reactExports.useEffect(() => {
    if (!enabled) {
      return void 0;
    }
    function onScrollMouseLeave(event) {
      if (isClickLikeOpenEvent() || !dataRef.current.floatingContext || !store.select("open")) {
        return;
      }
      const triggerElements = store.context.triggerElements;
      if (event.relatedTarget && triggerElements.hasElement(event.relatedTarget)) {
        return;
      }
      clearPointerEvents();
      cleanupMouseMoveHandler();
      if (!isClickLikeOpenEvent()) {
        closeWithDelay(event);
      }
    }
    function onFloatingMouseEnter(event) {
      openChangeTimeout.clear();
      clearPointerEvents();
      handlerRef.current?.(event);
      cleanupMouseMoveHandler();
    }
    function onFloatingMouseLeave(event) {
      if (!isClickLikeOpenEvent()) {
        closeWithDelay(event, false);
      }
    }
    const floating = floatingElement;
    if (floating) {
      floating.addEventListener("mouseleave", onScrollMouseLeave);
      floating.addEventListener("mouseenter", onFloatingMouseEnter);
      floating.addEventListener("mouseleave", onFloatingMouseLeave);
      floating.addEventListener("pointerdown", handleInteractInside, true);
    }
    return () => {
      if (floating) {
        floating.removeEventListener("mouseleave", onScrollMouseLeave);
        floating.removeEventListener("mouseenter", onFloatingMouseEnter);
        floating.removeEventListener("mouseleave", onFloatingMouseLeave);
        floating.removeEventListener("pointerdown", handleInteractInside, true);
      }
    };
  });
}
function getDelay(value, pointerType) {
  if (pointerType && !isMouseLikePointerType(pointerType)) {
    return 0;
  }
  if (typeof value === "function") {
    return value();
  }
  return value;
}
function getRestMs(value) {
  if (typeof value === "function") {
    return value();
  }
  return value;
}
const EMPTY_REF = {
  current: null
};
function useHoverReferenceInteraction(context, props = {}) {
  const store = "rootStore" in context ? context.rootStore : context;
  const {
    dataRef,
    events
  } = store.context;
  const {
    enabled = true,
    delay = 0,
    handleClose = null,
    mouseOnly = false,
    restMs = 0,
    move = true,
    triggerElementRef = EMPTY_REF,
    externalTree,
    isActiveTrigger = true
  } = props;
  const tree = useFloatingTree(externalTree);
  const {
    pointerTypeRef,
    interactedInsideRef,
    handlerRef: closeHandlerRef,
    blockMouseMoveRef,
    performedPointerEventsMutationRef,
    unbindMouseMoveRef,
    restTimeoutPendingRef,
    openChangeTimeout,
    restTimeout,
    handleCloseOptionsRef
  } = useHoverInteractionSharedState(store);
  const handleCloseRef = useValueAsRef(handleClose);
  const delayRef = useValueAsRef(delay);
  const restMsRef = useValueAsRef(restMs);
  if (isActiveTrigger) {
    handleCloseOptionsRef.current = handleCloseRef.current?.__options;
  }
  const isClickLikeOpenEvent = useStableCallback(() => {
    if (interactedInsideRef.current) {
      return true;
    }
    return dataRef.current.openEvent ? ["click", "mousedown"].includes(dataRef.current.openEvent.type) : false;
  });
  const closeWithDelay = reactExports.useCallback((event, runElseBranch = true) => {
    const closeDelay = getDelay$1(delayRef.current, "close", pointerTypeRef.current);
    if (closeDelay && !closeHandlerRef.current) {
      openChangeTimeout.start(closeDelay, () => store.setOpen(false, createChangeEventDetails(triggerHover, event)));
    } else if (runElseBranch) {
      openChangeTimeout.clear();
      store.setOpen(false, createChangeEventDetails(triggerHover, event));
    }
  }, [delayRef, closeHandlerRef, store, pointerTypeRef, openChangeTimeout]);
  const cleanupMouseMoveHandler = useStableCallback(() => {
    unbindMouseMoveRef.current();
    closeHandlerRef.current = void 0;
  });
  const clearPointerEvents = useStableCallback(() => {
    if (performedPointerEventsMutationRef.current) {
      const body = getDocument(store.select("domReferenceElement")).body;
      body.style.pointerEvents = "";
      body.removeAttribute(safePolygonIdentifier);
      performedPointerEventsMutationRef.current = false;
    }
  });
  reactExports.useEffect(() => {
    if (!enabled) {
      return void 0;
    }
    function onOpenChangeLocal(details) {
      if (!details.open) {
        openChangeTimeout.clear();
        restTimeout.clear();
        blockMouseMoveRef.current = true;
        restTimeoutPendingRef.current = false;
      }
    }
    events.on("openchange", onOpenChangeLocal);
    return () => {
      events.off("openchange", onOpenChangeLocal);
    };
  }, [enabled, events, openChangeTimeout, restTimeout, blockMouseMoveRef, restTimeoutPendingRef]);
  const handleScrollMouseLeave = useStableCallback((event) => {
    if (isClickLikeOpenEvent()) {
      return;
    }
    if (!dataRef.current.floatingContext) {
      return;
    }
    const triggerElements = store.context.triggerElements;
    if (event.relatedTarget && triggerElements.hasElement(event.relatedTarget)) {
      return;
    }
    const currentTrigger = triggerElementRef.current;
    handleCloseRef.current?.({
      ...dataRef.current.floatingContext,
      tree,
      x: event.clientX,
      y: event.clientY,
      onClose() {
        clearPointerEvents();
        cleanupMouseMoveHandler();
        if (!isClickLikeOpenEvent() && currentTrigger === store.select("domReferenceElement")) {
          closeWithDelay(event);
        }
      }
    })(event);
  });
  reactExports.useEffect(() => {
    if (!enabled) {
      return void 0;
    }
    const trigger = triggerElementRef.current ?? (isActiveTrigger ? store.select("domReferenceElement") : null);
    if (!isElement(trigger)) {
      return void 0;
    }
    function onMouseEnter(event) {
      openChangeTimeout.clear();
      blockMouseMoveRef.current = false;
      if (mouseOnly && !isMouseLikePointerType(pointerTypeRef.current)) {
        return;
      }
      if (getRestMs(restMsRef.current) > 0 && !getDelay$1(delayRef.current, "open")) {
        return;
      }
      const openDelay = getDelay$1(delayRef.current, "open", pointerTypeRef.current);
      const currentDomReference = store.select("domReferenceElement");
      const allTriggers = store.context.triggerElements;
      const isOverInactiveTrigger = (allTriggers.hasElement(event.target) || allTriggers.hasMatchingElement((t) => contains(t, event.target))) && (!currentDomReference || !contains(currentDomReference, event.target));
      const triggerNode = event.currentTarget ?? null;
      const isOpen = store.select("open");
      const shouldOpen = !isOpen || isOverInactiveTrigger;
      if (isOverInactiveTrigger && isOpen) {
        store.setOpen(true, createChangeEventDetails(triggerHover, event, triggerNode));
      } else if (openDelay) {
        openChangeTimeout.start(openDelay, () => {
          if (shouldOpen) {
            store.setOpen(true, createChangeEventDetails(triggerHover, event, triggerNode));
          }
        });
      } else if (shouldOpen) {
        store.setOpen(true, createChangeEventDetails(triggerHover, event, triggerNode));
      }
    }
    function onMouseLeave(event) {
      if (isClickLikeOpenEvent()) {
        clearPointerEvents();
        return;
      }
      unbindMouseMoveRef.current();
      const domReferenceElement = store.select("domReferenceElement");
      const doc = getDocument(domReferenceElement);
      restTimeout.clear();
      restTimeoutPendingRef.current = false;
      const triggerElements = store.context.triggerElements;
      if (event.relatedTarget && triggerElements.hasElement(event.relatedTarget)) {
        return;
      }
      if (handleCloseRef.current && dataRef.current.floatingContext) {
        if (!store.select("open")) {
          openChangeTimeout.clear();
        }
        const currentTrigger = triggerElementRef.current;
        closeHandlerRef.current = handleCloseRef.current({
          ...dataRef.current.floatingContext,
          tree,
          x: event.clientX,
          y: event.clientY,
          onClose() {
            clearPointerEvents();
            cleanupMouseMoveHandler();
            if (!isClickLikeOpenEvent() && currentTrigger === store.select("domReferenceElement")) {
              closeWithDelay(event, true);
            }
          }
        });
        const handler = closeHandlerRef.current;
        handler(event);
        doc.addEventListener("mousemove", handler);
        unbindMouseMoveRef.current = () => {
          doc.removeEventListener("mousemove", handler);
        };
        return;
      }
      const shouldClose = pointerTypeRef.current === "touch" ? !contains(store.select("floatingElement"), event.relatedTarget) : true;
      if (shouldClose) {
        closeWithDelay(event);
      }
    }
    function onScrollMouseLeave(event) {
      handleScrollMouseLeave(event);
    }
    if (store.select("open")) {
      trigger.addEventListener("mouseleave", onScrollMouseLeave);
    }
    if (move) {
      trigger.addEventListener("mousemove", onMouseEnter, {
        once: true
      });
    }
    trigger.addEventListener("mouseenter", onMouseEnter);
    trigger.addEventListener("mouseleave", onMouseLeave);
    return () => {
      trigger.removeEventListener("mouseleave", onScrollMouseLeave);
      if (move) {
        trigger.removeEventListener("mousemove", onMouseEnter);
      }
      trigger.removeEventListener("mouseenter", onMouseEnter);
      trigger.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [cleanupMouseMoveHandler, clearPointerEvents, blockMouseMoveRef, dataRef, delayRef, closeWithDelay, store, enabled, handleCloseRef, handleScrollMouseLeave, isActiveTrigger, isClickLikeOpenEvent, mouseOnly, move, pointerTypeRef, restMsRef, restTimeout, restTimeoutPendingRef, openChangeTimeout, triggerElementRef, tree, unbindMouseMoveRef, closeHandlerRef]);
  return reactExports.useMemo(() => {
    function setPointerRef(event) {
      pointerTypeRef.current = event.pointerType;
    }
    return {
      onPointerDown: setPointerRef,
      onPointerEnter: setPointerRef,
      onMouseMove(event) {
        const {
          nativeEvent
        } = event;
        const trigger = event.currentTarget;
        const currentDomReference = store.select("domReferenceElement");
        const allTriggers = store.context.triggerElements;
        const currentOpen = store.select("open");
        const isOverInactiveTrigger = (allTriggers.hasElement(event.target) || allTriggers.hasMatchingElement((t) => contains(t, event.target))) && (!currentDomReference || !contains(currentDomReference, event.target));
        if (mouseOnly && !isMouseLikePointerType(pointerTypeRef.current)) {
          return;
        }
        if (currentOpen && !isOverInactiveTrigger || getRestMs(restMsRef.current) === 0) {
          return;
        }
        if (!isOverInactiveTrigger && restTimeoutPendingRef.current && event.movementX ** 2 + event.movementY ** 2 < 2) {
          return;
        }
        restTimeout.clear();
        function handleMouseMove() {
          restTimeoutPendingRef.current = false;
          if (isClickLikeOpenEvent()) {
            return;
          }
          const latestOpen = store.select("open");
          if (!blockMouseMoveRef.current && (!latestOpen || isOverInactiveTrigger)) {
            store.setOpen(true, createChangeEventDetails(triggerHover, nativeEvent, trigger));
          }
        }
        if (pointerTypeRef.current === "touch") {
          reactDomExports.flushSync(() => {
            handleMouseMove();
          });
        } else if (isOverInactiveTrigger && currentOpen) {
          handleMouseMove();
        } else {
          restTimeoutPendingRef.current = true;
          restTimeout.start(getRestMs(restMsRef.current), handleMouseMove);
        }
      }
    };
  }, [blockMouseMoveRef, isClickLikeOpenEvent, mouseOnly, store, pointerTypeRef, restMsRef, restTimeout, restTimeoutPendingRef]);
}
function useInteractions(propsList = []) {
  const referenceDeps = propsList.map((key) => key?.reference);
  const floatingDeps = propsList.map((key) => key?.floating);
  const itemDeps = propsList.map((key) => key?.item);
  const triggerDeps = propsList.map((key) => key?.trigger);
  const getReferenceProps = reactExports.useCallback(
    (userProps) => mergeProps(userProps, propsList, "reference"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    referenceDeps
  );
  const getFloatingProps = reactExports.useCallback(
    (userProps) => mergeProps(userProps, propsList, "floating"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    floatingDeps
  );
  const getItemProps = reactExports.useCallback(
    (userProps) => mergeProps(userProps, propsList, "item"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    itemDeps
  );
  const getTriggerProps = reactExports.useCallback(
    (userProps) => mergeProps(userProps, propsList, "trigger"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    triggerDeps
  );
  return reactExports.useMemo(() => ({
    getReferenceProps,
    getFloatingProps,
    getItemProps,
    getTriggerProps
  }), [getReferenceProps, getFloatingProps, getItemProps, getTriggerProps]);
}
function mergeProps(userProps, propsList, elementKey) {
  const eventHandlers = /* @__PURE__ */ new Map();
  const isItem = elementKey === "item";
  const outputProps = {};
  if (elementKey === "floating") {
    outputProps.tabIndex = -1;
    outputProps[FOCUSABLE_ATTRIBUTE] = "";
  }
  for (const key in userProps) {
    if (isItem && userProps) {
      if (key === ACTIVE_KEY || key === SELECTED_KEY) {
        continue;
      }
    }
    outputProps[key] = userProps[key];
  }
  for (let i = 0; i < propsList.length; i += 1) {
    let props;
    const propsOrGetProps = propsList[i]?.[elementKey];
    if (typeof propsOrGetProps === "function") {
      props = userProps ? propsOrGetProps(userProps) : null;
    } else {
      props = propsOrGetProps;
    }
    if (!props) {
      continue;
    }
    mutablyMergeProps(outputProps, props, isItem, eventHandlers);
  }
  mutablyMergeProps(outputProps, userProps, isItem, eventHandlers);
  return outputProps;
}
function mutablyMergeProps(outputProps, props, isItem, eventHandlers) {
  for (const key in props) {
    const value = props[key];
    if (isItem && (key === ACTIVE_KEY || key === SELECTED_KEY)) {
      continue;
    }
    if (!key.startsWith("on")) {
      outputProps[key] = value;
    } else {
      if (!eventHandlers.has(key)) {
        eventHandlers.set(key, []);
      }
      if (typeof value === "function") {
        eventHandlers.get(key)?.push(value);
        outputProps[key] = (...args) => {
          return eventHandlers.get(key)?.map((fn) => fn(...args)).find((val) => val !== void 0);
        };
      }
    }
  }
}
const ESCAPE = "Escape";
function doSwitch(orientation, vertical, horizontal) {
  switch (orientation) {
    case "vertical":
      return vertical;
    case "horizontal":
      return horizontal;
    default:
      return vertical || horizontal;
  }
}
function isMainOrientationKey(key, orientation) {
  const vertical = key === ARROW_UP$1 || key === ARROW_DOWN$1;
  const horizontal = key === ARROW_LEFT$1 || key === ARROW_RIGHT$1;
  return doSwitch(orientation, vertical, horizontal);
}
function isMainOrientationToEndKey(key, orientation, rtl) {
  const vertical = key === ARROW_DOWN$1;
  const horizontal = rtl ? key === ARROW_LEFT$1 : key === ARROW_RIGHT$1;
  return doSwitch(orientation, vertical, horizontal) || key === "Enter" || key === " " || key === "";
}
function isCrossOrientationOpenKey(key, orientation, rtl) {
  const vertical = rtl ? key === ARROW_LEFT$1 : key === ARROW_RIGHT$1;
  const horizontal = key === ARROW_DOWN$1;
  return doSwitch(orientation, vertical, horizontal);
}
function isCrossOrientationCloseKey(key, orientation, rtl, cols) {
  const vertical = rtl ? key === ARROW_RIGHT$1 : key === ARROW_LEFT$1;
  const horizontal = key === ARROW_UP$1;
  if (orientation === "both" || orientation === "horizontal" && cols && cols > 1) {
    return key === ESCAPE;
  }
  return doSwitch(orientation, vertical, horizontal);
}
function useListNavigation(context, props) {
  const store = "rootStore" in context ? context.rootStore : context;
  const open = store.useState("open");
  const floatingElement = store.useState("floatingElement");
  const domReferenceElement = store.useState("domReferenceElement");
  const dataRef = store.context.dataRef;
  const {
    listRef,
    activeIndex,
    onNavigate: onNavigateProp = () => {
    },
    enabled = true,
    selectedIndex = null,
    allowEscape = false,
    loopFocus = false,
    nested = false,
    rtl = false,
    virtual = false,
    focusItemOnOpen = "auto",
    focusItemOnHover = true,
    openOnArrowKeyDown = true,
    disabledIndices = void 0,
    orientation = "vertical",
    parentOrientation,
    cols = 1,
    scrollItemIntoView = true,
    itemSizes,
    dense = false,
    id,
    resetOnPointerLeave = true,
    externalTree
  } = props;
  const floatingFocusElement = getFloatingFocusElement(floatingElement);
  const floatingFocusElementRef = useValueAsRef(floatingFocusElement);
  const parentId = useFloatingParentNodeId();
  const tree = useFloatingTree(externalTree);
  useIsoLayoutEffect(() => {
    dataRef.current.orientation = orientation;
  }, [dataRef, orientation]);
  const typeableComboboxReference = isTypeableCombobox(domReferenceElement);
  const focusItemOnOpenRef = reactExports.useRef(focusItemOnOpen);
  const indexRef = reactExports.useRef(selectedIndex ?? -1);
  const keyRef = reactExports.useRef(null);
  const isPointerModalityRef = reactExports.useRef(true);
  const onNavigate = useStableCallback((event) => {
    onNavigateProp(indexRef.current === -1 ? null : indexRef.current, event);
  });
  const previousOnNavigateRef = reactExports.useRef(onNavigate);
  const previousMountedRef = reactExports.useRef(!!floatingElement);
  const previousOpenRef = reactExports.useRef(open);
  const forceSyncFocusRef = reactExports.useRef(false);
  const forceScrollIntoViewRef = reactExports.useRef(false);
  const disabledIndicesRef = useValueAsRef(disabledIndices);
  const latestOpenRef = useValueAsRef(open);
  const scrollItemIntoViewRef = useValueAsRef(scrollItemIntoView);
  const selectedIndexRef = useValueAsRef(selectedIndex);
  const resetOnPointerLeaveRef = useValueAsRef(resetOnPointerLeave);
  const focusItem = useStableCallback(() => {
    function runFocus(item2) {
      if (virtual) {
        tree?.events.emit("virtualfocus", item2);
      } else {
        enqueueFocus(item2, {
          sync: forceSyncFocusRef.current,
          preventScroll: true
        });
      }
    }
    const initialItem = listRef.current[indexRef.current];
    const forceScrollIntoView = forceScrollIntoViewRef.current;
    if (initialItem) {
      runFocus(initialItem);
    }
    const scheduler = forceSyncFocusRef.current ? (v) => v() : requestAnimationFrame;
    scheduler(() => {
      const waitedItem = listRef.current[indexRef.current] || initialItem;
      if (!waitedItem) {
        return;
      }
      if (!initialItem) {
        runFocus(waitedItem);
      }
      const scrollIntoViewOptions = scrollItemIntoViewRef.current;
      const shouldScrollIntoView = scrollIntoViewOptions && // eslint-disable-next-line @typescript-eslint/no-use-before-define
      item && (forceScrollIntoView || !isPointerModalityRef.current);
      if (shouldScrollIntoView) {
        waitedItem.scrollIntoView?.(typeof scrollIntoViewOptions === "boolean" ? {
          block: "nearest",
          inline: "nearest"
        } : scrollIntoViewOptions);
      }
    });
  });
  useIsoLayoutEffect(() => {
    if (!enabled) {
      return;
    }
    if (open && floatingElement) {
      indexRef.current = selectedIndex ?? -1;
      if (focusItemOnOpenRef.current && selectedIndex != null) {
        forceScrollIntoViewRef.current = true;
        onNavigate();
      }
    } else if (previousMountedRef.current) {
      indexRef.current = -1;
      previousOnNavigateRef.current();
    }
  }, [enabled, open, floatingElement, selectedIndex, onNavigate]);
  useIsoLayoutEffect(() => {
    if (!enabled) {
      return;
    }
    if (!open) {
      forceSyncFocusRef.current = false;
      return;
    }
    if (!floatingElement) {
      return;
    }
    if (activeIndex == null) {
      forceSyncFocusRef.current = false;
      if (selectedIndexRef.current != null) {
        return;
      }
      if (previousMountedRef.current) {
        indexRef.current = -1;
        focusItem();
      }
      if ((!previousOpenRef.current || !previousMountedRef.current) && focusItemOnOpenRef.current && (keyRef.current != null || focusItemOnOpenRef.current === true && keyRef.current == null)) {
        let runs = 0;
        const waitForListPopulated = () => {
          if (listRef.current[0] == null) {
            if (runs < 2) {
              const scheduler = runs ? requestAnimationFrame : queueMicrotask;
              scheduler(waitForListPopulated);
            }
            runs += 1;
          } else {
            indexRef.current = keyRef.current == null || isMainOrientationToEndKey(keyRef.current, orientation, rtl) || nested ? getMinListIndex(listRef) : getMaxListIndex(listRef);
            keyRef.current = null;
            onNavigate();
          }
        };
        waitForListPopulated();
      }
    } else if (!isIndexOutOfListBounds(listRef, activeIndex)) {
      indexRef.current = activeIndex;
      focusItem();
      forceScrollIntoViewRef.current = false;
    }
  }, [enabled, open, floatingElement, activeIndex, selectedIndexRef, nested, listRef, orientation, rtl, onNavigate, focusItem, disabledIndicesRef]);
  useIsoLayoutEffect(() => {
    if (!enabled || floatingElement || !tree || virtual || !previousMountedRef.current) {
      return;
    }
    const nodes = tree.nodesRef.current;
    const parent = nodes.find((node) => node.id === parentId)?.context?.elements.floating;
    const activeEl = activeElement(getDocument(floatingElement));
    const treeContainsActiveEl = nodes.some((node) => node.context && contains(node.context.elements.floating, activeEl));
    if (parent && !treeContainsActiveEl && isPointerModalityRef.current) {
      parent.focus({
        preventScroll: true
      });
    }
  }, [enabled, floatingElement, tree, parentId, virtual]);
  useIsoLayoutEffect(() => {
    previousOnNavigateRef.current = onNavigate;
    previousOpenRef.current = open;
    previousMountedRef.current = !!floatingElement;
  });
  useIsoLayoutEffect(() => {
    if (!open) {
      keyRef.current = null;
      focusItemOnOpenRef.current = focusItemOnOpen;
    }
  }, [open, focusItemOnOpen]);
  const hasActiveIndex = activeIndex != null;
  const item = reactExports.useMemo(() => {
    function syncCurrentTarget(event) {
      if (!latestOpenRef.current) {
        return;
      }
      const index = listRef.current.indexOf(event.currentTarget);
      if (index !== -1 && indexRef.current !== index) {
        indexRef.current = index;
        onNavigate(event);
      }
    }
    const itemProps = {
      onFocus(event) {
        forceSyncFocusRef.current = true;
        syncCurrentTarget(event);
      },
      onClick: ({
        currentTarget
      }) => currentTarget.focus({
        preventScroll: true
      }),
      // Safari
      onMouseMove(event) {
        forceSyncFocusRef.current = true;
        forceScrollIntoViewRef.current = false;
        if (focusItemOnHover) {
          syncCurrentTarget(event);
        }
      },
      onPointerLeave(event) {
        if (!latestOpenRef.current || !isPointerModalityRef.current || event.pointerType === "touch") {
          return;
        }
        forceSyncFocusRef.current = true;
        const relatedTarget = event.relatedTarget;
        if (!focusItemOnHover || listRef.current.includes(relatedTarget)) {
          return;
        }
        if (!resetOnPointerLeaveRef.current) {
          return;
        }
        indexRef.current = -1;
        onNavigate(event);
        if (!virtual) {
          floatingFocusElementRef.current?.focus({
            preventScroll: true
          });
        }
      }
    };
    return itemProps;
  }, [latestOpenRef, floatingFocusElementRef, focusItemOnHover, listRef, onNavigate, resetOnPointerLeaveRef, virtual]);
  const getParentOrientation = reactExports.useCallback(() => {
    return parentOrientation ?? tree?.nodesRef.current.find((node) => node.id === parentId)?.context?.dataRef?.current.orientation;
  }, [parentId, tree, parentOrientation]);
  const commonOnKeyDown = useStableCallback((event) => {
    isPointerModalityRef.current = false;
    forceSyncFocusRef.current = true;
    if (event.which === 229) {
      return;
    }
    if (!latestOpenRef.current && event.currentTarget === floatingFocusElementRef.current) {
      return;
    }
    if (nested && isCrossOrientationCloseKey(event.key, orientation, rtl, cols)) {
      if (!isMainOrientationKey(event.key, getParentOrientation())) {
        stopEvent(event);
      }
      store.setOpen(false, createChangeEventDetails(listNavigation, event.nativeEvent));
      if (isHTMLElement(domReferenceElement)) {
        if (virtual) {
          tree?.events.emit("virtualfocus", domReferenceElement);
        } else {
          domReferenceElement.focus();
        }
      }
      return;
    }
    const currentIndex = indexRef.current;
    const minIndex = getMinListIndex(listRef, disabledIndices);
    const maxIndex = getMaxListIndex(listRef, disabledIndices);
    if (!typeableComboboxReference) {
      if (event.key === "Home") {
        stopEvent(event);
        indexRef.current = minIndex;
        onNavigate(event);
      }
      if (event.key === "End") {
        stopEvent(event);
        indexRef.current = maxIndex;
        onNavigate(event);
      }
    }
    if (cols > 1) {
      const sizes = itemSizes || Array.from({
        length: listRef.current.length
      }, () => ({
        width: 1,
        height: 1
      }));
      const cellMap = createGridCellMap(sizes, cols, dense);
      const minGridIndex = cellMap.findIndex((index2) => index2 != null && !isListIndexDisabled(listRef, index2, disabledIndices));
      const maxGridIndex = cellMap.reduce((foundIndex, index2, cellIndex) => index2 != null && !isListIndexDisabled(listRef, index2, disabledIndices) ? cellIndex : foundIndex, -1);
      const index = cellMap[getGridNavigatedIndex({
        current: cellMap.map((itemIndex) => itemIndex != null ? listRef.current[itemIndex] : null)
      }, {
        event,
        orientation,
        loopFocus,
        rtl,
        cols,
        // treat undefined (empty grid spaces) as disabled indices so we
        // don't end up in them
        disabledIndices: getGridCellIndices([...(typeof disabledIndices !== "function" ? disabledIndices : null) || listRef.current.map((_, listIndex) => isListIndexDisabled(listRef, listIndex, disabledIndices) ? listIndex : void 0), void 0], cellMap),
        minIndex: minGridIndex,
        maxIndex: maxGridIndex,
        prevIndex: getGridCellIndexOfCorner(
          indexRef.current > maxIndex ? minIndex : indexRef.current,
          sizes,
          cellMap,
          cols,
          // use a corner matching the edge closest to the direction
          // we're moving in so we don't end up in the same item. Prefer
          // top/left over bottom/right.
          // eslint-disable-next-line no-nested-ternary
          event.key === ARROW_DOWN$1 ? "bl" : event.key === (rtl ? ARROW_LEFT$1 : ARROW_RIGHT$1) ? "tr" : "tl"
        ),
        stopEvent: true
      })];
      if (index != null) {
        indexRef.current = index;
        onNavigate(event);
      }
      if (orientation === "both") {
        return;
      }
    }
    if (isMainOrientationKey(event.key, orientation)) {
      stopEvent(event);
      if (open && !virtual && activeElement(event.currentTarget.ownerDocument) === event.currentTarget) {
        indexRef.current = isMainOrientationToEndKey(event.key, orientation, rtl) ? minIndex : maxIndex;
        onNavigate(event);
        return;
      }
      if (isMainOrientationToEndKey(event.key, orientation, rtl)) {
        if (loopFocus) {
          if (currentIndex >= maxIndex) {
            if (allowEscape && currentIndex !== listRef.current.length) {
              indexRef.current = -1;
            } else {
              forceSyncFocusRef.current = false;
              indexRef.current = minIndex;
            }
          } else {
            indexRef.current = findNonDisabledListIndex(listRef, {
              startingIndex: currentIndex,
              disabledIndices
            });
          }
        } else {
          indexRef.current = Math.min(maxIndex, findNonDisabledListIndex(listRef, {
            startingIndex: currentIndex,
            disabledIndices
          }));
        }
      } else if (loopFocus) {
        if (currentIndex <= minIndex) {
          if (allowEscape && currentIndex !== -1) {
            indexRef.current = listRef.current.length;
          } else {
            forceSyncFocusRef.current = false;
            indexRef.current = maxIndex;
          }
        } else {
          indexRef.current = findNonDisabledListIndex(listRef, {
            startingIndex: currentIndex,
            decrement: true,
            disabledIndices
          });
        }
      } else {
        indexRef.current = Math.max(minIndex, findNonDisabledListIndex(listRef, {
          startingIndex: currentIndex,
          decrement: true,
          disabledIndices
        }));
      }
      if (isIndexOutOfListBounds(listRef, indexRef.current)) {
        indexRef.current = -1;
      }
      onNavigate(event);
    }
  });
  const ariaActiveDescendantProp = reactExports.useMemo(() => {
    return virtual && open && hasActiveIndex && {
      "aria-activedescendant": `${id}-${activeIndex}`
    };
  }, [virtual, open, hasActiveIndex, id, activeIndex]);
  const floating = reactExports.useMemo(() => {
    return {
      "aria-orientation": orientation === "both" ? void 0 : orientation,
      ...!typeableComboboxReference ? ariaActiveDescendantProp : {},
      onKeyDown(event) {
        if (event.key === "Tab" && event.shiftKey && open && !virtual) {
          const target = getTarget(event.nativeEvent);
          if (target && !contains(floatingFocusElementRef.current, target)) {
            return;
          }
          stopEvent(event);
          store.setOpen(false, createChangeEventDetails(focusOut, event.nativeEvent));
          if (isHTMLElement(domReferenceElement)) {
            domReferenceElement.focus();
          }
          return;
        }
        commonOnKeyDown(event);
      },
      onPointerMove() {
        isPointerModalityRef.current = true;
      }
    };
  }, [ariaActiveDescendantProp, commonOnKeyDown, floatingFocusElementRef, orientation, typeableComboboxReference, store, open, virtual, domReferenceElement]);
  const trigger = reactExports.useMemo(() => {
    function checkVirtualMouse(event) {
      if (focusItemOnOpen === "auto" && isVirtualClick(event.nativeEvent)) {
        focusItemOnOpenRef.current = !virtual;
      }
    }
    function checkVirtualPointer(event) {
      focusItemOnOpenRef.current = focusItemOnOpen;
      if (focusItemOnOpen === "auto" && isVirtualPointerEvent(event.nativeEvent)) {
        focusItemOnOpenRef.current = true;
      }
    }
    return {
      onKeyDown(event) {
        const currentOpen = store.select("open");
        isPointerModalityRef.current = false;
        const isArrowKey = event.key.startsWith("Arrow");
        const isParentCrossOpenKey = isCrossOrientationOpenKey(event.key, getParentOrientation(), rtl);
        const isMainKey = isMainOrientationKey(event.key, orientation);
        const isNavigationKey = (nested ? isParentCrossOpenKey : isMainKey) || event.key === "Enter" || event.key.trim() === "";
        if (virtual && currentOpen) {
          return commonOnKeyDown(event);
        }
        if (!currentOpen && !openOnArrowKeyDown && isArrowKey) {
          return void 0;
        }
        if (isNavigationKey) {
          const isParentMainKey = isMainOrientationKey(event.key, getParentOrientation());
          keyRef.current = nested && isParentMainKey ? null : event.key;
        }
        if (nested) {
          if (isParentCrossOpenKey) {
            stopEvent(event);
            if (currentOpen) {
              indexRef.current = getMinListIndex(listRef, disabledIndicesRef.current);
              onNavigate(event);
            } else {
              store.setOpen(true, createChangeEventDetails(listNavigation, event.nativeEvent, event.currentTarget));
            }
          }
          return void 0;
        }
        if (isMainKey) {
          if (selectedIndexRef.current != null) {
            indexRef.current = selectedIndexRef.current;
          }
          stopEvent(event);
          if (!currentOpen && openOnArrowKeyDown) {
            store.setOpen(true, createChangeEventDetails(listNavigation, event.nativeEvent, event.currentTarget));
          } else {
            commonOnKeyDown(event);
          }
          if (currentOpen) {
            onNavigate(event);
          }
        }
        return void 0;
      },
      onFocus(event) {
        if (store.select("open") && !virtual) {
          indexRef.current = -1;
          onNavigate(event);
        }
      },
      onPointerDown: checkVirtualPointer,
      onPointerEnter: checkVirtualPointer,
      onMouseDown: checkVirtualMouse,
      onClick: checkVirtualMouse
    };
  }, [commonOnKeyDown, disabledIndicesRef, focusItemOnOpen, listRef, nested, onNavigate, store, openOnArrowKeyDown, orientation, getParentOrientation, rtl, selectedIndexRef, virtual]);
  const reference = reactExports.useMemo(() => {
    return {
      ...ariaActiveDescendantProp,
      ...trigger
    };
  }, [ariaActiveDescendantProp, trigger]);
  return reactExports.useMemo(() => enabled ? {
    reference,
    floating,
    item,
    trigger
  } : {}, [enabled, reference, floating, trigger, item]);
}
const componentRoleToAriaRoleMap = /* @__PURE__ */ new Map([["select", "listbox"], ["combobox", "listbox"], ["label", false]]);
function useRole(context, props = {}) {
  const store = "rootStore" in context ? context.rootStore : context;
  const open = store.useState("open");
  const defaultFloatingId = store.useState("floatingId");
  const domReference = store.useState("domReferenceElement");
  const floatingElement = store.useState("floatingElement");
  const {
    enabled = true,
    role = "dialog"
  } = props;
  const defaultReferenceId = useId();
  const referenceId = domReference?.id || defaultReferenceId;
  const floatingId = reactExports.useMemo(() => getFloatingFocusElement(floatingElement)?.id || defaultFloatingId, [floatingElement, defaultFloatingId]);
  const ariaRole = componentRoleToAriaRoleMap.get(role) ?? role;
  const parentId = useFloatingParentNodeId();
  const isNested = parentId != null;
  const trigger = reactExports.useMemo(() => {
    if (ariaRole === "tooltip" || role === "label") {
      return EMPTY_OBJECT;
    }
    return {
      "aria-haspopup": ariaRole === "alertdialog" ? "dialog" : ariaRole,
      "aria-expanded": "false",
      ...ariaRole === "listbox" && {
        role: "combobox"
      },
      ...ariaRole === "menu" && isNested && {
        role: "menuitem"
      },
      ...role === "select" && {
        "aria-autocomplete": "none"
      },
      ...role === "combobox" && {
        "aria-autocomplete": "list"
      }
    };
  }, [ariaRole, isNested, role]);
  const reference = reactExports.useMemo(() => {
    if (ariaRole === "tooltip" || role === "label") {
      return {
        [`aria-${role === "label" ? "labelledby" : "describedby"}`]: open ? floatingId : void 0
      };
    }
    const triggerProps = trigger;
    return {
      ...triggerProps,
      "aria-expanded": open ? "true" : "false",
      "aria-controls": open ? floatingId : void 0,
      ...ariaRole === "menu" && {
        id: referenceId
      }
    };
  }, [ariaRole, floatingId, open, referenceId, role, trigger]);
  const floating = reactExports.useMemo(() => {
    const floatingProps = {
      id: floatingId,
      ...ariaRole && {
        role: ariaRole
      }
    };
    if (ariaRole === "tooltip" || role === "label") {
      return floatingProps;
    }
    return {
      ...floatingProps,
      ...ariaRole === "menu" && {
        "aria-labelledby": referenceId
      }
    };
  }, [ariaRole, floatingId, referenceId, role]);
  const item = reactExports.useCallback(({
    active,
    selected
  }) => {
    const commonProps = {
      role: "option",
      ...active && {
        id: `${floatingId}-fui-option`
      }
    };
    switch (role) {
      case "select":
      case "combobox":
        return {
          ...commonProps,
          "aria-selected": selected
        };
    }
    return {};
  }, [floatingId, role]);
  return reactExports.useMemo(() => enabled ? {
    reference,
    floating,
    item,
    trigger
  } : {}, [enabled, reference, floating, trigger, item]);
}
function useTypeahead(context, props) {
  const store = "rootStore" in context ? context.rootStore : context;
  const open = store.useState("open");
  const dataRef = store.context.dataRef;
  const {
    listRef,
    activeIndex,
    onMatch: onMatchProp,
    onTypingChange,
    enabled = true,
    findMatch = null,
    resetMs = 750,
    ignoreKeys = EMPTY_ARRAY,
    selectedIndex = null
  } = props;
  const timeout = useTimeout();
  const stringRef = reactExports.useRef("");
  const prevIndexRef = reactExports.useRef(selectedIndex ?? activeIndex ?? -1);
  const matchIndexRef = reactExports.useRef(null);
  useIsoLayoutEffect(() => {
    if (open) {
      timeout.clear();
      matchIndexRef.current = null;
      stringRef.current = "";
    }
  }, [open, timeout]);
  useIsoLayoutEffect(() => {
    if (open && stringRef.current === "") {
      prevIndexRef.current = selectedIndex ?? activeIndex ?? -1;
    }
  }, [open, selectedIndex, activeIndex]);
  const setTypingChange = useStableCallback((value) => {
    if (value) {
      if (!dataRef.current.typing) {
        dataRef.current.typing = value;
        onTypingChange?.(value);
      }
    } else if (dataRef.current.typing) {
      dataRef.current.typing = value;
      onTypingChange?.(value);
    }
  });
  const onKeyDown = useStableCallback((event) => {
    function getMatchingIndex(list, orderedList, string) {
      const str = findMatch ? findMatch(orderedList, string) : orderedList.find((text) => text?.toLocaleLowerCase().indexOf(string.toLocaleLowerCase()) === 0);
      return str ? list.indexOf(str) : -1;
    }
    const listContent = listRef.current;
    if (stringRef.current.length > 0 && stringRef.current[0] !== " ") {
      if (getMatchingIndex(listContent, listContent, stringRef.current) === -1) {
        setTypingChange(false);
      } else if (event.key === " ") {
        stopEvent(event);
      }
    }
    if (listContent == null || ignoreKeys.includes(event.key) || // Character key.
    event.key.length !== 1 || // Modifier key.
    event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (open && event.key !== " ") {
      stopEvent(event);
      setTypingChange(true);
    }
    const allowRapidSuccessionOfFirstLetter = listContent.every((text) => text ? text[0]?.toLocaleLowerCase() !== text[1]?.toLocaleLowerCase() : true);
    if (allowRapidSuccessionOfFirstLetter && stringRef.current === event.key) {
      stringRef.current = "";
      prevIndexRef.current = matchIndexRef.current;
    }
    stringRef.current += event.key;
    timeout.start(resetMs, () => {
      stringRef.current = "";
      prevIndexRef.current = matchIndexRef.current;
      setTypingChange(false);
    });
    const prevIndex = prevIndexRef.current;
    const index = getMatchingIndex(listContent, [...listContent.slice((prevIndex || 0) + 1), ...listContent.slice(0, (prevIndex || 0) + 1)], stringRef.current);
    if (index !== -1) {
      onMatchProp?.(index);
      matchIndexRef.current = index;
    } else if (event.key !== " ") {
      stringRef.current = "";
      setTypingChange(false);
    }
  });
  const reference = reactExports.useMemo(() => ({
    onKeyDown
  }), [onKeyDown]);
  const floating = reactExports.useMemo(() => {
    return {
      onKeyDown,
      onKeyUp(event) {
        if (event.key === " ") {
          setTypingChange(false);
        }
      }
    };
  }, [onKeyDown, setTypingChange]);
  return reactExports.useMemo(() => enabled ? {
    reference,
    floating
  } : {}, [enabled, reference, floating]);
}
function isPointInPolygon(point, polygon) {
  const [x, y] = point;
  let isInsideValue = false;
  const length = polygon.length;
  for (let i = 0, j = length - 1; i < length; j = i++) {
    const [xi, yi] = polygon[i] || [0, 0];
    const [xj, yj] = polygon[j] || [0, 0];
    const intersect = yi >= y !== yj >= y && x <= (xj - xi) * (y - yi) / (yj - yi) + xi;
    if (intersect) {
      isInsideValue = !isInsideValue;
    }
  }
  return isInsideValue;
}
function isInside(point, rect) {
  return point[0] >= rect.x && point[0] <= rect.x + rect.width && point[1] >= rect.y && point[1] <= rect.y + rect.height;
}
function safePolygon(options = {}) {
  const {
    buffer = 0.5,
    blockPointerEvents = false,
    requireIntent = true
  } = options;
  const timeout = new Timeout();
  let hasLanded = false;
  let lastX = null;
  let lastY = null;
  let lastCursorTime = typeof performance !== "undefined" ? performance.now() : 0;
  function getCursorSpeed(x, y) {
    const currentTime = performance.now();
    const elapsedTime = currentTime - lastCursorTime;
    if (lastX === null || lastY === null || elapsedTime === 0) {
      lastX = x;
      lastY = y;
      lastCursorTime = currentTime;
      return null;
    }
    const deltaX = x - lastX;
    const deltaY = y - lastY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const speed = distance / elapsedTime;
    lastX = x;
    lastY = y;
    lastCursorTime = currentTime;
    return speed;
  }
  const fn = ({
    x,
    y,
    placement,
    elements,
    onClose,
    nodeId,
    tree
  }) => {
    return function onMouseMove(event) {
      function close() {
        timeout.clear();
        onClose();
      }
      timeout.clear();
      if (!elements.domReference || !elements.floating || placement == null || x == null || y == null) {
        return void 0;
      }
      const {
        clientX,
        clientY
      } = event;
      const clientPoint = [clientX, clientY];
      const target = getTarget(event);
      const isLeave = event.type === "mouseleave";
      const isOverFloatingEl = contains(elements.floating, target);
      const isOverReferenceEl = contains(elements.domReference, target);
      const refRect = elements.domReference.getBoundingClientRect();
      const rect = elements.floating.getBoundingClientRect();
      const side = placement.split("-")[0];
      const cursorLeaveFromRight = x > rect.right - rect.width / 2;
      const cursorLeaveFromBottom = y > rect.bottom - rect.height / 2;
      const isOverReferenceRect = isInside(clientPoint, refRect);
      const isFloatingWider = rect.width > refRect.width;
      const isFloatingTaller = rect.height > refRect.height;
      const left = (isFloatingWider ? refRect : rect).left;
      const right = (isFloatingWider ? refRect : rect).right;
      const top = (isFloatingTaller ? refRect : rect).top;
      const bottom = (isFloatingTaller ? refRect : rect).bottom;
      if (isOverFloatingEl) {
        hasLanded = true;
        if (!isLeave) {
          return void 0;
        }
      }
      if (isOverReferenceEl) {
        hasLanded = false;
      }
      if (isOverReferenceEl && !isLeave) {
        hasLanded = true;
        return void 0;
      }
      if (isLeave && isElement(event.relatedTarget) && contains(elements.floating, event.relatedTarget)) {
        return void 0;
      }
      if (tree && getNodeChildren(tree.nodesRef.current, nodeId).some(({
        context
      }) => context?.open)) {
        return void 0;
      }
      if (side === "top" && y >= refRect.bottom - 1 || side === "bottom" && y <= refRect.top + 1 || side === "left" && x >= refRect.right - 1 || side === "right" && x <= refRect.left + 1) {
        return close();
      }
      let rectPoly = [];
      switch (side) {
        case "top":
          rectPoly = [[left, refRect.top + 1], [left, rect.bottom - 1], [right, rect.bottom - 1], [right, refRect.top + 1]];
          break;
        case "bottom":
          rectPoly = [[left, rect.top + 1], [left, refRect.bottom - 1], [right, refRect.bottom - 1], [right, rect.top + 1]];
          break;
        case "left":
          rectPoly = [[rect.right - 1, bottom], [rect.right - 1, top], [refRect.left + 1, top], [refRect.left + 1, bottom]];
          break;
        case "right":
          rectPoly = [[refRect.right - 1, bottom], [refRect.right - 1, top], [rect.left + 1, top], [rect.left + 1, bottom]];
          break;
      }
      function getPolygon([px, py]) {
        switch (side) {
          case "top": {
            const cursorPointOne = [isFloatingWider ? px + buffer / 2 : cursorLeaveFromRight ? px + buffer * 4 : px - buffer * 4, py + buffer + 1];
            const cursorPointTwo = [isFloatingWider ? px - buffer / 2 : cursorLeaveFromRight ? px + buffer * 4 : px - buffer * 4, py + buffer + 1];
            const commonPoints = [[rect.left, cursorLeaveFromRight ? rect.bottom - buffer : isFloatingWider ? rect.bottom - buffer : rect.top], [rect.right, cursorLeaveFromRight ? isFloatingWider ? rect.bottom - buffer : rect.top : rect.bottom - buffer]];
            return [cursorPointOne, cursorPointTwo, ...commonPoints];
          }
          case "bottom": {
            const cursorPointOne = [isFloatingWider ? px + buffer / 2 : cursorLeaveFromRight ? px + buffer * 4 : px - buffer * 4, py - buffer];
            const cursorPointTwo = [isFloatingWider ? px - buffer / 2 : cursorLeaveFromRight ? px + buffer * 4 : px - buffer * 4, py - buffer];
            const commonPoints = [[rect.left, cursorLeaveFromRight ? rect.top + buffer : isFloatingWider ? rect.top + buffer : rect.bottom], [rect.right, cursorLeaveFromRight ? isFloatingWider ? rect.top + buffer : rect.bottom : rect.top + buffer]];
            return [cursorPointOne, cursorPointTwo, ...commonPoints];
          }
          case "left": {
            const cursorPointOne = [px + buffer + 1, isFloatingTaller ? py + buffer / 2 : cursorLeaveFromBottom ? py + buffer * 4 : py - buffer * 4];
            const cursorPointTwo = [px + buffer + 1, isFloatingTaller ? py - buffer / 2 : cursorLeaveFromBottom ? py + buffer * 4 : py - buffer * 4];
            const commonPoints = [[cursorLeaveFromBottom ? rect.right - buffer : isFloatingTaller ? rect.right - buffer : rect.left, rect.top], [cursorLeaveFromBottom ? isFloatingTaller ? rect.right - buffer : rect.left : rect.right - buffer, rect.bottom]];
            return [...commonPoints, cursorPointOne, cursorPointTwo];
          }
          case "right": {
            const cursorPointOne = [px - buffer, isFloatingTaller ? py + buffer / 2 : cursorLeaveFromBottom ? py + buffer * 4 : py - buffer * 4];
            const cursorPointTwo = [px - buffer, isFloatingTaller ? py - buffer / 2 : cursorLeaveFromBottom ? py + buffer * 4 : py - buffer * 4];
            const commonPoints = [[cursorLeaveFromBottom ? rect.left + buffer : isFloatingTaller ? rect.left + buffer : rect.right, rect.top], [cursorLeaveFromBottom ? isFloatingTaller ? rect.left + buffer : rect.right : rect.left + buffer, rect.bottom]];
            return [cursorPointOne, cursorPointTwo, ...commonPoints];
          }
          default:
            return [];
        }
      }
      if (isPointInPolygon([clientX, clientY], rectPoly)) {
        return void 0;
      }
      if (hasLanded && !isOverReferenceRect) {
        return close();
      }
      if (!isLeave && requireIntent) {
        const cursorSpeed = getCursorSpeed(event.clientX, event.clientY);
        const cursorSpeedThreshold = 0.1;
        if (cursorSpeed !== null && cursorSpeed < cursorSpeedThreshold) {
          return close();
        }
      }
      if (!isPointInPolygon([clientX, clientY], getPolygon([x, y]))) {
        close();
      } else if (!hasLanded && requireIntent) {
        timeout.start(40, close);
      }
      return void 0;
    };
  };
  fn.__options = {
    blockPointerEvents
  };
  return fn;
}
let DialogPopupCssVars = /* @__PURE__ */ (function(DialogPopupCssVars2) {
  DialogPopupCssVars2["nestedDialogs"] = "--nested-dialogs";
  return DialogPopupCssVars2;
})({});
let DialogPopupDataAttributes = (function(DialogPopupDataAttributes2) {
  DialogPopupDataAttributes2[DialogPopupDataAttributes2["open"] = CommonPopupDataAttributes.open] = "open";
  DialogPopupDataAttributes2[DialogPopupDataAttributes2["closed"] = CommonPopupDataAttributes.closed] = "closed";
  DialogPopupDataAttributes2[DialogPopupDataAttributes2["startingStyle"] = CommonPopupDataAttributes.startingStyle] = "startingStyle";
  DialogPopupDataAttributes2[DialogPopupDataAttributes2["endingStyle"] = CommonPopupDataAttributes.endingStyle] = "endingStyle";
  DialogPopupDataAttributes2["nested"] = "data-nested";
  DialogPopupDataAttributes2["nestedDialogOpen"] = "data-nested-dialog-open";
  return DialogPopupDataAttributes2;
})({});
const DialogPortalContext = /* @__PURE__ */ reactExports.createContext(void 0);
function useDialogPortalContext() {
  const value = reactExports.useContext(DialogPortalContext);
  if (value === void 0) {
    throw new Error(formatErrorMessage(26));
  }
  return value;
}
const ARROW_UP = "ArrowUp";
const ARROW_DOWN = "ArrowDown";
const ARROW_LEFT = "ArrowLeft";
const ARROW_RIGHT = "ArrowRight";
const HOME = "Home";
const END = "End";
const HORIZONTAL_KEYS = /* @__PURE__ */ new Set([ARROW_LEFT, ARROW_RIGHT]);
const VERTICAL_KEYS = /* @__PURE__ */ new Set([ARROW_UP, ARROW_DOWN]);
const ARROW_KEYS = /* @__PURE__ */ new Set([...HORIZONTAL_KEYS, ...VERTICAL_KEYS]);
/* @__PURE__ */ new Set([...ARROW_KEYS, HOME, END]);
const COMPOSITE_KEYS = /* @__PURE__ */ new Set([ARROW_UP, ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT, HOME, END]);
const stateAttributesMapping$4 = {
  ...popupStateMapping,
  ...transitionStatusMapping,
  nestedDialogOpen(value) {
    return value ? {
      [DialogPopupDataAttributes.nestedDialogOpen]: ""
    } : null;
  }
};
const DialogPopup = /* @__PURE__ */ reactExports.forwardRef(function DialogPopup2(componentProps, forwardedRef) {
  const {
    className,
    finalFocus,
    initialFocus,
    render,
    ...elementProps
  } = componentProps;
  const {
    store
  } = useDialogRootContext();
  const descriptionElementId = store.useState("descriptionElementId");
  const disablePointerDismissal = store.useState("disablePointerDismissal");
  const floatingRootContext = store.useState("floatingRootContext");
  const rootPopupProps = store.useState("popupProps");
  const modal = store.useState("modal");
  const mounted = store.useState("mounted");
  const nested = store.useState("nested");
  const nestedOpenDialogCount = store.useState("nestedOpenDialogCount");
  const open = store.useState("open");
  const openMethod = store.useState("openMethod");
  const titleElementId = store.useState("titleElementId");
  const transitionStatus = store.useState("transitionStatus");
  const role = store.useState("role");
  useDialogPortalContext();
  useOpenChangeComplete({
    open,
    ref: store.context.popupRef,
    onComplete() {
      if (open) {
        store.context.onOpenChangeComplete?.(true);
      }
    }
  });
  function defaultInitialFocus(interactionType) {
    if (interactionType === "touch") {
      return store.context.popupRef.current;
    }
    return true;
  }
  const resolvedInitialFocus = initialFocus === void 0 ? defaultInitialFocus : initialFocus;
  const nestedDialogOpen = nestedOpenDialogCount > 0;
  const state = reactExports.useMemo(() => ({
    open,
    nested,
    transitionStatus,
    nestedDialogOpen
  }), [open, nested, transitionStatus, nestedDialogOpen]);
  const element = useRenderElement("div", componentProps, {
    state,
    props: [rootPopupProps, {
      "aria-labelledby": titleElementId ?? void 0,
      "aria-describedby": descriptionElementId ?? void 0,
      role,
      tabIndex: -1,
      hidden: !mounted,
      onKeyDown(event) {
        if (COMPOSITE_KEYS.has(event.key)) {
          event.stopPropagation();
        }
      },
      style: {
        [DialogPopupCssVars.nestedDialogs]: nestedOpenDialogCount
      }
    }, elementProps],
    ref: [forwardedRef, store.context.popupRef, store.useStateSetter("popupElement")],
    stateAttributesMapping: stateAttributesMapping$4
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(FloatingFocusManager, {
    context: floatingRootContext,
    openInteractionType: openMethod,
    disabled: !mounted,
    closeOnFocusOut: !disablePointerDismissal,
    initialFocus: resolvedInitialFocus,
    returnFocus: finalFocus,
    modal: modal !== false,
    restoreFocus: "popup",
    children: element
  });
});
const InternalBackdrop = /* @__PURE__ */ reactExports.forwardRef(function InternalBackdrop2(props, ref) {
  const {
    cutout,
    ...otherProps
  } = props;
  let clipPath;
  if (cutout) {
    const rect = cutout?.getBoundingClientRect();
    clipPath = `polygon(
      0% 0%,
      100% 0%,
      100% 100%,
      0% 100%,
      0% 0%,
      ${rect.left}px ${rect.top}px,
      ${rect.left}px ${rect.bottom}px,
      ${rect.right}px ${rect.bottom}px,
      ${rect.right}px ${rect.top}px,
      ${rect.left}px ${rect.top}px
    )`;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", {
    ref,
    role: "presentation",
    "data-base-ui-inert": "",
    ...otherProps,
    style: {
      position: "fixed",
      inset: 0,
      userSelect: "none",
      WebkitUserSelect: "none",
      clipPath
    }
  });
});
const DialogPortal = /* @__PURE__ */ reactExports.forwardRef(function DialogPortal2(props, forwardedRef) {
  const {
    keepMounted = false,
    ...portalProps
  } = props;
  const {
    store
  } = useDialogRootContext();
  const mounted = store.useState("mounted");
  const modal = store.useState("modal");
  const open = store.useState("open");
  const shouldRender = mounted || keepMounted;
  if (!shouldRender) {
    return null;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(DialogPortalContext.Provider, {
    value: keepMounted,
    children: /* @__PURE__ */ jsxRuntimeExports.jsxs(FloatingPortal, {
      ref: forwardedRef,
      ...portalProps,
      children: [mounted && modal === true && /* @__PURE__ */ jsxRuntimeExports.jsx(InternalBackdrop, {
        ref: store.context.internalBackdropRef,
        inert: inertValue(!open)
      }), props.children]
    })
  });
});
function useOpenInteractionType(open) {
  const [openMethod, setOpenMethod] = reactExports.useState(null);
  const handleTriggerClick = useStableCallback((_, interactionType) => {
    if (!open) {
      setOpenMethod(interactionType || // On iOS Safari, the hitslop around touch targets means tapping outside an element's
      // bounds does not fire `pointerdown` but does fire `mousedown`. The `interactionType`
      // will be "" in that case.
      (isIOS ? "touch" : ""));
    }
  });
  const reset = reactExports.useCallback(() => {
    setOpenMethod(null);
  }, []);
  const {
    onClick,
    onPointerDown
  } = useEnhancedClickHandler(handleTriggerClick);
  return reactExports.useMemo(() => ({
    openMethod,
    reset,
    triggerProps: {
      onClick,
      onPointerDown
    }
  }), [openMethod, reset, onClick, onPointerDown]);
}
function useDialogRoot(params) {
  const {
    store,
    parentContext,
    actionsRef
  } = params;
  const open = store.useState("open");
  const disablePointerDismissal = store.useState("disablePointerDismissal");
  const modal = store.useState("modal");
  const popupElement = store.useState("popupElement");
  const {
    openMethod,
    triggerProps,
    reset: resetOpenInteractionType
  } = useOpenInteractionType(open);
  useImplicitActiveTrigger(store);
  const {
    forceUnmount
  } = useOpenStateTransitions(open, store, () => {
    resetOpenInteractionType();
  });
  const createDialogEventDetails = useStableCallback((reason) => {
    const details = createChangeEventDetails(reason);
    details.preventUnmountOnClose = () => {
      store.set("preventUnmountingOnClose", true);
    };
    return details;
  });
  const handleImperativeClose = reactExports.useCallback(() => {
    store.setOpen(false, createDialogEventDetails(imperativeAction));
  }, [store, createDialogEventDetails]);
  reactExports.useImperativeHandle(actionsRef, () => ({
    unmount: forceUnmount,
    close: handleImperativeClose
  }), [forceUnmount, handleImperativeClose]);
  const floatingRootContext = useSyncedFloatingRootContext({
    popupStore: store,
    onOpenChange: store.setOpen,
    treatPopupAsFloatingElement: true,
    noEmit: true
  });
  const [ownNestedOpenDialogs, setOwnNestedOpenDialogs] = reactExports.useState(0);
  const isTopmost = ownNestedOpenDialogs === 0;
  const role = useRole(floatingRootContext);
  const dismiss = useDismiss(floatingRootContext, {
    outsidePressEvent() {
      if (store.context.internalBackdropRef.current || store.context.backdropRef.current) {
        return "intentional";
      }
      return {
        mouse: modal === "trap-focus" ? "sloppy" : "intentional",
        touch: "sloppy"
      };
    },
    outsidePress(event) {
      if ("button" in event && event.button !== 0) {
        return false;
      }
      if ("touches" in event && event.touches.length !== 1) {
        return false;
      }
      const target = getTarget(event);
      if (isTopmost && !disablePointerDismissal) {
        const eventTarget = target;
        if (modal) {
          return store.context.internalBackdropRef.current || store.context.backdropRef.current ? store.context.internalBackdropRef.current === eventTarget || store.context.backdropRef.current === eventTarget || contains(eventTarget, popupElement) && !eventTarget?.hasAttribute("data-base-ui-portal") : true;
        }
        return true;
      }
      return false;
    },
    escapeKey: isTopmost
  });
  useScrollLock(open && modal === true, popupElement);
  const {
    getReferenceProps,
    getFloatingProps,
    getTriggerProps
  } = useInteractions([role, dismiss]);
  store.useContextCallback("onNestedDialogOpen", (ownChildrenCount) => {
    setOwnNestedOpenDialogs(ownChildrenCount + 1);
  });
  store.useContextCallback("onNestedDialogClose", () => {
    setOwnNestedOpenDialogs(0);
  });
  reactExports.useEffect(() => {
    if (parentContext?.onNestedDialogOpen && open) {
      parentContext.onNestedDialogOpen(ownNestedOpenDialogs);
    }
    if (parentContext?.onNestedDialogClose && !open) {
      parentContext.onNestedDialogClose();
    }
    return () => {
      if (parentContext?.onNestedDialogClose && open) {
        parentContext.onNestedDialogClose();
      }
    };
  }, [open, parentContext, ownNestedOpenDialogs]);
  const activeTriggerProps = reactExports.useMemo(() => getReferenceProps(triggerProps), [getReferenceProps, triggerProps]);
  const inactiveTriggerProps = reactExports.useMemo(() => getTriggerProps(triggerProps), [getTriggerProps, triggerProps]);
  const popupProps = reactExports.useMemo(() => getFloatingProps(), [getFloatingProps]);
  store.useSyncedValues({
    openMethod,
    activeTriggerProps,
    inactiveTriggerProps,
    popupProps,
    floatingRootContext,
    nestedOpenDialogCount: ownNestedOpenDialogs
  });
}
const selectors$2 = {
  ...popupStoreSelectors,
  modal: createSelector((state) => state.modal),
  nested: createSelector((state) => state.nested),
  nestedOpenDialogCount: createSelector((state) => state.nestedOpenDialogCount),
  disablePointerDismissal: createSelector((state) => state.disablePointerDismissal),
  openMethod: createSelector((state) => state.openMethod),
  descriptionElementId: createSelector((state) => state.descriptionElementId),
  titleElementId: createSelector((state) => state.titleElementId),
  viewportElement: createSelector((state) => state.viewportElement),
  role: createSelector((state) => state.role)
};
class DialogStore extends ReactStore {
  constructor(initialState) {
    super(createInitialState$1(initialState), {
      popupRef: /* @__PURE__ */ reactExports.createRef(),
      backdropRef: /* @__PURE__ */ reactExports.createRef(),
      internalBackdropRef: /* @__PURE__ */ reactExports.createRef(),
      triggerElements: new PopupTriggerMap(),
      onOpenChange: void 0,
      onOpenChangeComplete: void 0
    }, selectors$2);
  }
  setOpen = (nextOpen, eventDetails) => {
    eventDetails.preventUnmountOnClose = () => {
      this.set("preventUnmountingOnClose", true);
    };
    if (!nextOpen && eventDetails.trigger == null && this.state.activeTriggerId != null) {
      eventDetails.trigger = this.state.activeTriggerElement ?? void 0;
    }
    this.context.onOpenChange?.(nextOpen, eventDetails);
    if (eventDetails.isCanceled) {
      return;
    }
    const details = {
      open: nextOpen,
      nativeEvent: eventDetails.event,
      reason: eventDetails.reason,
      nested: this.state.nested
    };
    this.state.floatingRootContext.context.events?.emit("openchange", details);
    const updatedState = {
      open: nextOpen
    };
    const newTriggerId = eventDetails.trigger?.id ?? null;
    if (newTriggerId || nextOpen) {
      updatedState.activeTriggerId = newTriggerId;
      updatedState.activeTriggerElement = eventDetails.trigger ?? null;
    }
    this.update(updatedState);
  };
}
function createInitialState$1(initialState = {}) {
  return {
    ...createInitialPopupStoreState(),
    modal: true,
    disablePointerDismissal: false,
    popupElement: null,
    viewportElement: null,
    descriptionElementId: void 0,
    titleElementId: void 0,
    openMethod: null,
    nested: false,
    nestedOpenDialogCount: 0,
    role: "dialog",
    ...initialState
  };
}
function DialogRoot(props) {
  const {
    children,
    open: openProp,
    defaultOpen = false,
    onOpenChange,
    onOpenChangeComplete,
    disablePointerDismissal = false,
    modal = true,
    actionsRef,
    handle,
    triggerId: triggerIdProp,
    defaultTriggerId: defaultTriggerIdProp = null
  } = props;
  const parentDialogRootContext = useDialogRootContext(true);
  const nested = Boolean(parentDialogRootContext);
  const store = useRefWithInit(() => {
    return handle?.store ?? new DialogStore({
      open: openProp ?? defaultOpen,
      activeTriggerId: triggerIdProp !== void 0 ? triggerIdProp : defaultTriggerIdProp,
      modal,
      disablePointerDismissal,
      nested
    });
  }).current;
  store.useControlledProp("open", openProp, defaultOpen);
  store.useControlledProp("activeTriggerId", triggerIdProp, defaultTriggerIdProp);
  store.useSyncedValues({
    disablePointerDismissal,
    nested,
    modal
  });
  store.useContextCallback("onOpenChange", onOpenChange);
  store.useContextCallback("onOpenChangeComplete", onOpenChangeComplete);
  const payload = store.useState("payload");
  useDialogRoot({
    store,
    actionsRef,
    parentContext: parentDialogRootContext?.store.context
  });
  const contextValue = reactExports.useMemo(() => ({
    store
  }), [store]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(DialogRootContext.Provider, {
    value: contextValue,
    children: typeof children === "function" ? children({
      payload
    }) : children
  });
}
const DialogTitle = /* @__PURE__ */ reactExports.forwardRef(function DialogTitle2(componentProps, forwardedRef) {
  const {
    render,
    className,
    id: idProp,
    ...elementProps
  } = componentProps;
  const {
    store
  } = useDialogRootContext();
  const id = useBaseUiId(idProp);
  store.useSyncedValueWithCleanup("titleElementId", id);
  return useRenderElement("h2", componentProps, {
    ref: forwardedRef,
    props: [{
      id
    }, elementProps]
  });
});
function useRender(params) {
  return useRenderElement(params.defaultTagName ?? "div", params, params);
}
const PopoverRootContext = /* @__PURE__ */ reactExports.createContext(void 0);
function usePopoverRootContext(optional) {
  const context = reactExports.useContext(PopoverRootContext);
  if (context === void 0 && !optional) {
    throw new Error(formatErrorMessage(47));
  }
  return context;
}
function createInitialState() {
  return {
    ...createInitialPopupStoreState(),
    disabled: false,
    modal: false,
    instantType: void 0,
    openMethod: null,
    openChangeReason: null,
    titleElementId: void 0,
    descriptionElementId: void 0,
    stickIfOpen: true,
    nested: false,
    openOnHover: false,
    closeDelay: 0,
    hasViewport: false
  };
}
const selectors$1 = {
  ...popupStoreSelectors,
  disabled: createSelector((state) => state.disabled),
  instantType: createSelector((state) => state.instantType),
  openMethod: createSelector((state) => state.openMethod),
  openChangeReason: createSelector((state) => state.openChangeReason),
  modal: createSelector((state) => state.modal),
  stickIfOpen: createSelector((state) => state.stickIfOpen),
  titleElementId: createSelector((state) => state.titleElementId),
  descriptionElementId: createSelector((state) => state.descriptionElementId),
  openOnHover: createSelector((state) => state.openOnHover),
  closeDelay: createSelector((state) => state.closeDelay),
  hasViewport: createSelector((state) => state.hasViewport)
};
class PopoverStore extends ReactStore {
  constructor(initialState) {
    const initial = {
      ...createInitialState(),
      ...initialState
    };
    if (initial.open && initialState?.mounted === void 0) {
      initial.mounted = true;
    }
    super(initial, {
      popupRef: /* @__PURE__ */ reactExports.createRef(),
      backdropRef: /* @__PURE__ */ reactExports.createRef(),
      internalBackdropRef: /* @__PURE__ */ reactExports.createRef(),
      onOpenChange: void 0,
      onOpenChangeComplete: void 0,
      triggerFocusTargetRef: /* @__PURE__ */ reactExports.createRef(),
      beforeContentFocusGuardRef: /* @__PURE__ */ reactExports.createRef(),
      stickIfOpenTimeout: new Timeout(),
      triggerElements: new PopupTriggerMap()
    }, selectors$1);
  }
  setOpen = (nextOpen, eventDetails) => {
    const isHover = eventDetails.reason === triggerHover;
    const isKeyboardClick = eventDetails.reason === triggerPress && eventDetails.event.detail === 0;
    const isDismissClose = !nextOpen && (eventDetails.reason === escapeKey || eventDetails.reason == null);
    eventDetails.preventUnmountOnClose = () => {
      this.set("preventUnmountingOnClose", true);
    };
    this.context.onOpenChange?.(nextOpen, eventDetails);
    if (eventDetails.isCanceled) {
      return;
    }
    const details = {
      open: nextOpen,
      nativeEvent: eventDetails.event,
      reason: eventDetails.reason,
      nested: this.state.nested,
      triggerElement: eventDetails.trigger
    };
    const floatingEvents = this.state.floatingRootContext.context.events;
    floatingEvents?.emit("openchange", details);
    const changeState = () => {
      const updatedState = {
        open: nextOpen,
        openChangeReason: eventDetails.reason
      };
      const newTriggerId = eventDetails.trigger?.id ?? null;
      if (newTriggerId || nextOpen) {
        updatedState.activeTriggerId = newTriggerId;
        updatedState.activeTriggerElement = eventDetails.trigger ?? null;
      }
      this.update(updatedState);
    };
    if (isHover) {
      this.set("stickIfOpen", true);
      this.context.stickIfOpenTimeout.start(PATIENT_CLICK_THRESHOLD, () => {
        this.set("stickIfOpen", false);
      });
      reactDomExports.flushSync(changeState);
    } else {
      changeState();
    }
    if (isKeyboardClick || isDismissClose) {
      this.set("instantType", isKeyboardClick ? "click" : "dismiss");
    } else if (eventDetails.reason === focusOut) {
      this.set("instantType", "focus");
    } else {
      this.set("instantType", void 0);
    }
  };
  static useStore(externalStore, initialState) {
    const internalStore = useRefWithInit(() => {
      return new PopoverStore(initialState);
    }).current;
    const store = externalStore ?? internalStore;
    useOnMount(internalStore.disposeEffect);
    return store;
  }
  disposeEffect = () => {
    return this.context.stickIfOpenTimeout.disposeEffect();
  };
}
function PopoverRootComponent({
  props
}) {
  const {
    children,
    open: openProp,
    defaultOpen: defaultOpenProp = false,
    onOpenChange,
    onOpenChangeComplete,
    modal = false,
    handle,
    triggerId: triggerIdProp,
    defaultTriggerId: defaultTriggerIdProp = null
  } = props;
  const store = PopoverStore.useStore(handle?.store, {
    open: openProp ?? defaultOpenProp,
    modal,
    activeTriggerId: triggerIdProp !== void 0 ? triggerIdProp : defaultTriggerIdProp
  });
  store.useControlledProp("open", openProp, defaultOpenProp);
  store.useControlledProp("activeTriggerId", triggerIdProp, defaultTriggerIdProp);
  const open = store.useState("open");
  const positionerElement = store.useState("positionerElement");
  const payload = store.useState("payload");
  const openReason = store.useState("openChangeReason");
  store.useContextCallback("onOpenChange", onOpenChange);
  store.useContextCallback("onOpenChangeComplete", onOpenChangeComplete);
  const {
    openMethod,
    triggerProps: interactionTypeTriggerProps,
    reset: resetOpenInteractionType
  } = useOpenInteractionType(open);
  useImplicitActiveTrigger(store);
  const {
    forceUnmount
  } = useOpenStateTransitions(open, store, () => {
    store.update({
      stickIfOpen: true,
      openChangeReason: null
    });
    resetOpenInteractionType();
  });
  useScrollLock(open && modal === true && openReason !== triggerHover && openMethod !== "touch", positionerElement);
  reactExports.useEffect(() => {
    if (!open) {
      store.context.stickIfOpenTimeout.clear();
    }
  }, [store, open]);
  const createPopoverEventDetails = reactExports.useCallback((reason) => {
    const details = createChangeEventDetails(reason);
    details.preventUnmountOnClose = () => {
      store.set("preventUnmountingOnClose", true);
    };
    return details;
  }, [store]);
  const handleImperativeClose = reactExports.useCallback(() => {
    store.setOpen(false, createPopoverEventDetails(imperativeAction));
  }, [store, createPopoverEventDetails]);
  reactExports.useImperativeHandle(props.actionsRef, () => ({
    unmount: forceUnmount,
    close: handleImperativeClose
  }), [forceUnmount, handleImperativeClose]);
  const floatingRootContext = useSyncedFloatingRootContext({
    popupStore: store,
    onOpenChange: store.setOpen
  });
  const dismiss = useDismiss(floatingRootContext, {
    outsidePressEvent: {
      // Ensure `aria-hidden` on outside elements is removed immediately
      // on outside press when trapping focus.
      mouse: modal === "trap-focus" ? "sloppy" : "intentional",
      touch: "sloppy"
    }
  });
  const role = useRole(floatingRootContext);
  const {
    getReferenceProps,
    getFloatingProps,
    getTriggerProps
  } = useInteractions([dismiss, role]);
  const activeTriggerProps = reactExports.useMemo(() => {
    return getReferenceProps(interactionTypeTriggerProps);
  }, [getReferenceProps, interactionTypeTriggerProps]);
  const inactiveTriggerProps = reactExports.useMemo(() => {
    return getTriggerProps(interactionTypeTriggerProps);
  }, [getTriggerProps, interactionTypeTriggerProps]);
  const popupProps = reactExports.useMemo(() => {
    return getFloatingProps();
  }, [getFloatingProps]);
  store.useSyncedValues({
    modal,
    openMethod,
    activeTriggerProps,
    inactiveTriggerProps,
    popupProps,
    floatingRootContext,
    nested: useFloatingParentNodeId() != null
  });
  const popoverContext = reactExports.useMemo(() => ({
    store
  }), [store]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverRootContext.Provider, {
    value: popoverContext,
    children: typeof children === "function" ? children({
      payload
    }) : children
  });
}
function PopoverRoot(props) {
  if (usePopoverRootContext(true)) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverRootComponent, {
      props
    });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(FloatingTree, {
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverRootComponent, {
      props
    })
  });
}
const OPEN_DELAY = 300;
const PopoverTrigger = /* @__PURE__ */ reactExports.forwardRef(function PopoverTrigger2(componentProps, forwardedRef) {
  const {
    render,
    className,
    disabled = false,
    nativeButton = true,
    handle,
    payload,
    openOnHover = false,
    delay = OPEN_DELAY,
    closeDelay = 0,
    id: idProp,
    ...elementProps
  } = componentProps;
  const rootContext = usePopoverRootContext(true);
  const store = handle?.store ?? rootContext?.store;
  if (!store) {
    throw new Error(formatErrorMessage(74));
  }
  const thisTriggerId = useBaseUiId(idProp);
  const isTriggerActive = store.useState("isTriggerActive", thisTriggerId);
  const floatingContext = store.useState("floatingRootContext");
  const isOpenedByThisTrigger = store.useState("isOpenedByTrigger", thisTriggerId);
  const triggerElementRef = reactExports.useRef(null);
  const {
    registerTrigger,
    isMountedByThisTrigger
  } = useTriggerDataForwarding(thisTriggerId, triggerElementRef, store, {
    payload,
    disabled,
    openOnHover,
    closeDelay
  });
  const openReason = store.useState("openChangeReason");
  const stickIfOpen = store.useState("stickIfOpen");
  const openMethod = store.useState("openMethod");
  const hoverProps = useHoverReferenceInteraction(floatingContext, {
    enabled: floatingContext != null && openOnHover && (openMethod !== "touch" || openReason !== triggerPress),
    mouseOnly: true,
    move: false,
    handleClose: safePolygon(),
    restMs: delay,
    delay: {
      close: closeDelay
    },
    triggerElementRef,
    isActiveTrigger: isTriggerActive
  });
  const click = useClick(floatingContext, {
    enabled: floatingContext != null,
    stickIfOpen
  });
  const localProps = useInteractions([click]);
  const rootTriggerProps = store.useState("triggerProps", isMountedByThisTrigger);
  const state = reactExports.useMemo(() => ({
    disabled,
    open: isOpenedByThisTrigger
  }), [disabled, isOpenedByThisTrigger]);
  const {
    getButtonProps,
    buttonRef
  } = useButton({
    disabled,
    native: nativeButton
  });
  const stateAttributesMapping2 = reactExports.useMemo(() => ({
    open(value) {
      if (value && openReason === triggerPress) {
        return pressableTriggerOpenStateMapping.open(value);
      }
      return triggerOpenStateMapping.open(value);
    }
  }), [openReason]);
  const element = useRenderElement("button", componentProps, {
    state,
    ref: [buttonRef, forwardedRef, registerTrigger, triggerElementRef],
    props: [localProps.getReferenceProps(), hoverProps, rootTriggerProps, {
      [CLICK_TRIGGER_IDENTIFIER]: "",
      id: thisTriggerId
    }, elementProps, getButtonProps],
    stateAttributesMapping: stateAttributesMapping2
  });
  const preFocusGuardRef = reactExports.useRef(null);
  const handlePreFocusGuardFocus = useStableCallback((event) => {
    reactDomExports.flushSync(() => {
      store.setOpen(false, createChangeEventDetails(focusOut, event.nativeEvent, event.currentTarget));
    });
    const previousTabbable = getTabbableBeforeElement(preFocusGuardRef.current);
    previousTabbable?.focus();
  });
  const handleFocusTargetFocus = useStableCallback((event) => {
    const positionerElement = store.select("positionerElement");
    if (positionerElement && isOutsideEvent(event, positionerElement)) {
      store.context.beforeContentFocusGuardRef.current?.focus();
    } else {
      reactDomExports.flushSync(() => {
        store.setOpen(false, createChangeEventDetails(focusOut, event.nativeEvent, event.currentTarget));
      });
      let nextTabbable = getTabbableAfterElement(store.context.triggerFocusTargetRef.current || triggerElementRef.current);
      while (nextTabbable !== null && contains(positionerElement, nextTabbable)) {
        const prevTabbable = nextTabbable;
        nextTabbable = getNextTabbable(nextTabbable);
        if (nextTabbable === prevTabbable) {
          break;
        }
      }
      nextTabbable?.focus();
    }
  });
  if (isTriggerActive) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(reactExports.Fragment, {
      children: [/* @__PURE__ */ jsxRuntimeExports.jsx(FocusGuard, {
        ref: preFocusGuardRef,
        onFocus: handlePreFocusGuardFocus
      }), /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.Fragment, {
        children: element
      }, thisTriggerId), /* @__PURE__ */ jsxRuntimeExports.jsx(FocusGuard, {
        ref: store.context.triggerFocusTargetRef,
        onFocus: handleFocusTargetFocus
      })]
    });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.Fragment, {
    children: element
  }, thisTriggerId);
});
const PopoverPortalContext = /* @__PURE__ */ reactExports.createContext(void 0);
function usePopoverPortalContext() {
  const value = reactExports.useContext(PopoverPortalContext);
  if (value === void 0) {
    throw new Error(formatErrorMessage(45));
  }
  return value;
}
const PopoverPortal = /* @__PURE__ */ reactExports.forwardRef(function PopoverPortal2(props, forwardedRef) {
  const {
    keepMounted = false,
    ...portalProps
  } = props;
  const {
    store
  } = usePopoverRootContext();
  const mounted = store.useState("mounted");
  const shouldRender = mounted || keepMounted;
  if (!shouldRender) {
    return null;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverPortalContext.Provider, {
    value: keepMounted,
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(FloatingPortal, {
      ref: forwardedRef,
      ...portalProps,
      renderGuards: false
    })
  });
});
const PopoverPositionerContext = /* @__PURE__ */ reactExports.createContext(void 0);
function usePopoverPositionerContext() {
  const context = reactExports.useContext(PopoverPositionerContext);
  if (!context) {
    throw new Error(formatErrorMessage(46));
  }
  return context;
}
const DirectionContext = /* @__PURE__ */ reactExports.createContext(void 0);
function useDirection() {
  const context = reactExports.useContext(DirectionContext);
  return context?.direction ?? "ltr";
}
const baseArrow = (options) => ({
  name: "arrow",
  options,
  async fn(state) {
    const {
      x,
      y,
      placement,
      rects,
      platform,
      elements,
      middlewareData
    } = state;
    const {
      element,
      padding = 0,
      offsetParent = "real"
    } = evaluate(options, state) || {};
    if (element == null) {
      return {};
    }
    const paddingObject = getPaddingObject(padding);
    const coords = {
      x,
      y
    };
    const axis = getAlignmentAxis(placement);
    const length = getAxisLength(axis);
    const arrowDimensions = await platform.getDimensions(element);
    const isYAxis = axis === "y";
    const minProp = isYAxis ? "top" : "left";
    const maxProp = isYAxis ? "bottom" : "right";
    const clientProp = isYAxis ? "clientHeight" : "clientWidth";
    const endDiff = rects.reference[length] + rects.reference[axis] - coords[axis] - rects.floating[length];
    const startDiff = coords[axis] - rects.reference[axis];
    const arrowOffsetParent = offsetParent === "real" ? await platform.getOffsetParent?.(element) : elements.floating;
    let clientSize = elements.floating[clientProp] || rects.floating[length];
    if (!clientSize || !await platform.isElement?.(arrowOffsetParent)) {
      clientSize = elements.floating[clientProp] || rects.floating[length];
    }
    const centerToReference = endDiff / 2 - startDiff / 2;
    const largestPossiblePadding = clientSize / 2 - arrowDimensions[length] / 2 - 1;
    const minPadding = Math.min(paddingObject[minProp], largestPossiblePadding);
    const maxPadding = Math.min(paddingObject[maxProp], largestPossiblePadding);
    const min = minPadding;
    const max = clientSize - arrowDimensions[length] - maxPadding;
    const center = clientSize / 2 - arrowDimensions[length] / 2 + centerToReference;
    const offset2 = clamp$1(min, center, max);
    const shouldAddOffset = !middlewareData.arrow && getAlignment(placement) != null && center !== offset2 && rects.reference[length] / 2 - (center < min ? minPadding : maxPadding) - arrowDimensions[length] / 2 < 0;
    const alignmentOffset = shouldAddOffset ? center < min ? center - min : center - max : 0;
    return {
      [axis]: coords[axis] + alignmentOffset,
      data: {
        [axis]: offset2,
        centerOffset: center - offset2 - alignmentOffset,
        ...shouldAddOffset && {
          alignmentOffset
        }
      },
      reset: shouldAddOffset
    };
  }
});
const arrow = (options, deps) => ({
  ...baseArrow(options),
  options: [options, deps]
});
const hide = {
  name: "hide",
  async fn(state) {
    const {
      width,
      height,
      x,
      y
    } = state.rects.reference;
    const anchorHidden = width === 0 && height === 0 && x === 0 && y === 0;
    const nativeHideResult = await hide$1().fn(state);
    return {
      data: {
        referenceHidden: nativeHideResult.data?.referenceHidden || anchorHidden
      }
    };
  }
};
const DEFAULT_SIDES = {
  sideX: "left",
  sideY: "top"
};
const adaptiveOrigin = {
  name: "adaptiveOrigin",
  async fn(state) {
    const {
      x: rawX,
      y: rawY,
      rects: {
        floating: floatRect
      },
      elements: {
        floating
      },
      platform,
      strategy,
      placement
    } = state;
    const win = getWindow(floating);
    const styles = win.getComputedStyle(floating);
    const hasTransition = styles.transitionDuration !== "0s" && styles.transitionDuration !== "";
    if (!hasTransition) {
      return {
        x: rawX,
        y: rawY,
        data: DEFAULT_SIDES
      };
    }
    const offsetParent = await platform.getOffsetParent?.(floating);
    let offsetDimensions = {
      width: 0,
      height: 0
    };
    if (strategy === "fixed" && win?.visualViewport) {
      offsetDimensions = {
        width: win.visualViewport.width,
        height: win.visualViewport.height
      };
    } else if (offsetParent === win) {
      const doc = ownerDocument(floating);
      offsetDimensions = {
        width: doc.documentElement.clientWidth,
        height: doc.documentElement.clientHeight
      };
    } else if (await platform.isElement?.(offsetParent)) {
      offsetDimensions = await platform.getDimensions(offsetParent);
    }
    const currentSide = getSide(placement);
    let x = rawX;
    let y = rawY;
    if (currentSide === "left") {
      x = offsetDimensions.width - (rawX + floatRect.width);
    }
    if (currentSide === "top") {
      y = offsetDimensions.height - (rawY + floatRect.height);
    }
    const sideX = currentSide === "left" ? "right" : DEFAULT_SIDES.sideX;
    const sideY = currentSide === "top" ? "bottom" : DEFAULT_SIDES.sideY;
    return {
      x,
      y,
      data: {
        sideX,
        sideY
      }
    };
  }
};
function getLogicalSide(sideParam, renderedSide, isRtl) {
  const isLogicalSideParam = sideParam === "inline-start" || sideParam === "inline-end";
  const logicalRight = isRtl ? "inline-start" : "inline-end";
  const logicalLeft = isRtl ? "inline-end" : "inline-start";
  return {
    top: "top",
    right: isLogicalSideParam ? logicalRight : "right",
    bottom: "bottom",
    left: isLogicalSideParam ? logicalLeft : "left"
  }[renderedSide];
}
function getOffsetData(state, sideParam, isRtl) {
  const {
    rects,
    placement
  } = state;
  const data = {
    side: getLogicalSide(sideParam, getSide(placement), isRtl),
    align: getAlignment(placement) || "center",
    anchor: {
      width: rects.reference.width,
      height: rects.reference.height
    },
    positioner: {
      width: rects.floating.width,
      height: rects.floating.height
    }
  };
  return data;
}
function useAnchorPositioning(params) {
  const {
    // Public parameters
    anchor,
    positionMethod = "absolute",
    side: sideParam = "bottom",
    sideOffset = 0,
    align = "center",
    alignOffset = 0,
    collisionBoundary,
    collisionPadding: collisionPaddingParam = 5,
    sticky = false,
    arrowPadding = 5,
    disableAnchorTracking = false,
    // Private parameters
    keepMounted = false,
    floatingRootContext,
    mounted,
    collisionAvoidance,
    shiftCrossAxis = false,
    nodeId,
    adaptiveOrigin: adaptiveOrigin2,
    lazyFlip = false,
    externalTree
  } = params;
  const [mountSide, setMountSide] = reactExports.useState(null);
  if (!mounted && mountSide !== null) {
    setMountSide(null);
  }
  const collisionAvoidanceSide = collisionAvoidance.side || "flip";
  const collisionAvoidanceAlign = collisionAvoidance.align || "flip";
  const collisionAvoidanceFallbackAxisSide = collisionAvoidance.fallbackAxisSide || "end";
  const anchorFn = typeof anchor === "function" ? anchor : void 0;
  const anchorFnCallback = useStableCallback(anchorFn);
  const anchorDep = anchorFn ? anchorFnCallback : anchor;
  const anchorValueRef = useValueAsRef(anchor);
  const direction = useDirection();
  const isRtl = direction === "rtl";
  const side = mountSide || {
    top: "top",
    right: "right",
    bottom: "bottom",
    left: "left",
    "inline-end": isRtl ? "left" : "right",
    "inline-start": isRtl ? "right" : "left"
  }[sideParam];
  const placement = align === "center" ? side : `${side}-${align}`;
  let collisionPadding = collisionPaddingParam;
  const bias = 1;
  const biasTop = sideParam === "bottom" ? bias : 0;
  const biasBottom = sideParam === "top" ? bias : 0;
  const biasLeft = sideParam === "right" ? bias : 0;
  const biasRight = sideParam === "left" ? bias : 0;
  if (typeof collisionPadding === "number") {
    collisionPadding = {
      top: collisionPadding + biasTop,
      right: collisionPadding + biasRight,
      bottom: collisionPadding + biasBottom,
      left: collisionPadding + biasLeft
    };
  } else if (collisionPadding) {
    collisionPadding = {
      top: (collisionPadding.top || 0) + biasTop,
      right: (collisionPadding.right || 0) + biasRight,
      bottom: (collisionPadding.bottom || 0) + biasBottom,
      left: (collisionPadding.left || 0) + biasLeft
    };
  }
  const commonCollisionProps = {
    boundary: collisionBoundary === "clipping-ancestors" ? "clippingAncestors" : collisionBoundary,
    padding: collisionPadding
  };
  const arrowRef = reactExports.useRef(null);
  const sideOffsetRef = useValueAsRef(sideOffset);
  const alignOffsetRef = useValueAsRef(alignOffset);
  const sideOffsetDep = typeof sideOffset !== "function" ? sideOffset : 0;
  const alignOffsetDep = typeof alignOffset !== "function" ? alignOffset : 0;
  const middleware = [offset((state) => {
    const data = getOffsetData(state, sideParam, isRtl);
    const sideAxis = typeof sideOffsetRef.current === "function" ? sideOffsetRef.current(data) : sideOffsetRef.current;
    const alignAxis = typeof alignOffsetRef.current === "function" ? alignOffsetRef.current(data) : alignOffsetRef.current;
    return {
      mainAxis: sideAxis,
      crossAxis: alignAxis,
      alignmentAxis: alignAxis
    };
  }, [sideOffsetDep, alignOffsetDep, isRtl, sideParam])];
  const shiftDisabled = collisionAvoidanceAlign === "none" && collisionAvoidanceSide !== "shift";
  const crossAxisShiftEnabled = !shiftDisabled && (sticky || shiftCrossAxis || collisionAvoidanceSide === "shift");
  const flipMiddleware = collisionAvoidanceSide === "none" ? null : flip({
    ...commonCollisionProps,
    // Ensure the popup flips if it's been limited by its --available-height and it resizes.
    // Since the size() padding is smaller than the flip() padding, flip() will take precedence.
    padding: {
      top: collisionPadding.top + bias,
      right: collisionPadding.right + bias,
      bottom: collisionPadding.bottom + bias,
      left: collisionPadding.left + bias
    },
    mainAxis: !shiftCrossAxis && collisionAvoidanceSide === "flip",
    crossAxis: collisionAvoidanceAlign === "flip" ? "alignment" : false,
    fallbackAxisSideDirection: collisionAvoidanceFallbackAxisSide
  });
  const shiftMiddleware = shiftDisabled ? null : shift((data) => {
    const html = ownerDocument(data.elements.floating).documentElement;
    return {
      ...commonCollisionProps,
      // Use the Layout Viewport to avoid shifting around when pinch-zooming
      // for context menus.
      rootBoundary: shiftCrossAxis ? {
        x: 0,
        y: 0,
        width: html.clientWidth,
        height: html.clientHeight
      } : void 0,
      mainAxis: collisionAvoidanceAlign !== "none",
      crossAxis: crossAxisShiftEnabled,
      limiter: sticky || shiftCrossAxis ? void 0 : limitShift((limitData) => {
        if (!arrowRef.current) {
          return {};
        }
        const {
          width,
          height
        } = arrowRef.current.getBoundingClientRect();
        const sideAxis = getSideAxis(getSide(limitData.placement));
        const arrowSize = sideAxis === "y" ? width : height;
        const offsetAmount = sideAxis === "y" ? collisionPadding.left + collisionPadding.right : collisionPadding.top + collisionPadding.bottom;
        return {
          offset: arrowSize / 2 + offsetAmount / 2
        };
      })
    };
  }, [commonCollisionProps, sticky, shiftCrossAxis, collisionPadding, collisionAvoidanceAlign]);
  if (collisionAvoidanceSide === "shift" || collisionAvoidanceAlign === "shift" || align === "center") {
    middleware.push(shiftMiddleware, flipMiddleware);
  } else {
    middleware.push(flipMiddleware, shiftMiddleware);
  }
  middleware.push(size({
    ...commonCollisionProps,
    apply({
      elements: {
        floating
      },
      rects: {
        reference
      },
      availableWidth,
      availableHeight
    }) {
      Object.entries({
        "--available-width": `${availableWidth}px`,
        "--available-height": `${availableHeight}px`,
        "--anchor-width": `${reference.width}px`,
        "--anchor-height": `${reference.height}px`
      }).forEach(([key, value]) => {
        floating.style.setProperty(key, value);
      });
    }
  }), arrow(() => ({
    // `transform-origin` calculations rely on an element existing. If the arrow hasn't been set,
    // we'll create a fake element.
    element: arrowRef.current || document.createElement("div"),
    padding: arrowPadding,
    offsetParent: "floating"
  }), [arrowPadding]), {
    name: "transformOrigin",
    fn(state) {
      const {
        elements: elements2,
        middlewareData: middlewareData2,
        placement: renderedPlacement2,
        rects,
        y: y2
      } = state;
      const currentRenderedSide = getSide(renderedPlacement2);
      const currentRenderedAxis = getSideAxis(currentRenderedSide);
      const arrowEl = arrowRef.current;
      const arrowX = middlewareData2.arrow?.x || 0;
      const arrowY = middlewareData2.arrow?.y || 0;
      const arrowWidth = arrowEl?.clientWidth || 0;
      const arrowHeight = arrowEl?.clientHeight || 0;
      const transformX = arrowX + arrowWidth / 2;
      const transformY = arrowY + arrowHeight / 2;
      const shiftY = Math.abs(middlewareData2.shift?.y || 0);
      const halfAnchorHeight = rects.reference.height / 2;
      const sideOffsetValue = typeof sideOffset === "function" ? sideOffset(getOffsetData(state, sideParam, isRtl)) : sideOffset;
      const isOverlappingAnchor = shiftY > sideOffsetValue;
      const adjacentTransformOrigin = {
        top: `${transformX}px calc(100% + ${sideOffsetValue}px)`,
        bottom: `${transformX}px ${-sideOffsetValue}px`,
        left: `calc(100% + ${sideOffsetValue}px) ${transformY}px`,
        right: `${-sideOffsetValue}px ${transformY}px`
      }[currentRenderedSide];
      const overlapTransformOrigin = `${transformX}px ${rects.reference.y + halfAnchorHeight - y2}px`;
      elements2.floating.style.setProperty("--transform-origin", crossAxisShiftEnabled && currentRenderedAxis === "y" && isOverlappingAnchor ? overlapTransformOrigin : adjacentTransformOrigin);
      return {};
    }
  }, hide, adaptiveOrigin2);
  useIsoLayoutEffect(() => {
    if (!mounted && floatingRootContext) {
      floatingRootContext.update({
        referenceElement: null,
        floatingElement: null,
        domReferenceElement: null
      });
    }
  }, [mounted, floatingRootContext]);
  const autoUpdateOptions = reactExports.useMemo(() => ({
    elementResize: !disableAnchorTracking && typeof ResizeObserver !== "undefined",
    layoutShift: !disableAnchorTracking && typeof IntersectionObserver !== "undefined"
  }), [disableAnchorTracking]);
  const {
    refs,
    elements,
    x,
    y,
    middlewareData,
    update,
    placement: renderedPlacement,
    context,
    isPositioned,
    floatingStyles: originalFloatingStyles
  } = useFloating({
    rootContext: floatingRootContext,
    placement,
    middleware,
    strategy: positionMethod,
    whileElementsMounted: keepMounted ? void 0 : (...args) => autoUpdate(...args, autoUpdateOptions),
    nodeId,
    externalTree
  });
  const {
    sideX,
    sideY
  } = middlewareData.adaptiveOrigin || DEFAULT_SIDES;
  const resolvedPosition = isPositioned ? positionMethod : "fixed";
  const floatingStyles = reactExports.useMemo(() => adaptiveOrigin2 ? {
    position: resolvedPosition,
    [sideX]: x,
    [sideY]: y
  } : {
    position: resolvedPosition,
    ...originalFloatingStyles
  }, [adaptiveOrigin2, resolvedPosition, sideX, x, sideY, y, originalFloatingStyles]);
  const registeredPositionReferenceRef = reactExports.useRef(null);
  useIsoLayoutEffect(() => {
    if (!mounted) {
      return;
    }
    const anchorValue = anchorValueRef.current;
    const resolvedAnchor = typeof anchorValue === "function" ? anchorValue() : anchorValue;
    const unwrappedElement = (isRef(resolvedAnchor) ? resolvedAnchor.current : resolvedAnchor) || null;
    const finalAnchor = unwrappedElement || null;
    if (finalAnchor !== registeredPositionReferenceRef.current) {
      refs.setPositionReference(finalAnchor);
      registeredPositionReferenceRef.current = finalAnchor;
    }
  }, [mounted, refs, anchorDep, anchorValueRef]);
  reactExports.useEffect(() => {
    if (!mounted) {
      return;
    }
    const anchorValue = anchorValueRef.current;
    if (typeof anchorValue === "function") {
      return;
    }
    if (isRef(anchorValue) && anchorValue.current !== registeredPositionReferenceRef.current) {
      refs.setPositionReference(anchorValue.current);
      registeredPositionReferenceRef.current = anchorValue.current;
    }
  }, [mounted, refs, anchorDep, anchorValueRef]);
  reactExports.useEffect(() => {
    if (keepMounted && mounted && elements.domReference && elements.floating) {
      return autoUpdate(elements.domReference, elements.floating, update, autoUpdateOptions);
    }
    return void 0;
  }, [keepMounted, mounted, elements, update, autoUpdateOptions]);
  const renderedSide = getSide(renderedPlacement);
  const logicalRenderedSide = getLogicalSide(sideParam, renderedSide, isRtl);
  const renderedAlign = getAlignment(renderedPlacement) || "center";
  const anchorHidden = Boolean(middlewareData.hide?.referenceHidden);
  useIsoLayoutEffect(() => {
    if (lazyFlip && mounted && isPositioned) {
      setMountSide(renderedSide);
    }
  }, [lazyFlip, mounted, isPositioned, renderedSide]);
  const arrowStyles = reactExports.useMemo(() => ({
    position: "absolute",
    top: middlewareData.arrow?.y,
    left: middlewareData.arrow?.x
  }), [middlewareData.arrow]);
  const arrowUncentered = middlewareData.arrow?.centerOffset !== 0;
  return reactExports.useMemo(() => ({
    positionerStyles: floatingStyles,
    arrowStyles,
    arrowRef,
    arrowUncentered,
    side: logicalRenderedSide,
    align: renderedAlign,
    physicalSide: renderedSide,
    anchorHidden,
    refs,
    context,
    isPositioned,
    update
  }), [floatingStyles, arrowStyles, arrowRef, arrowUncentered, logicalRenderedSide, renderedAlign, renderedSide, anchorHidden, refs, context, isPositioned, update]);
}
function isRef(param) {
  return param != null && "current" in param;
}
function getDisabledMountTransitionStyles(transitionStatus) {
  return transitionStatus === "starting" ? DISABLED_TRANSITIONS_STYLE : EMPTY_OBJECT;
}
const PopoverPositioner = /* @__PURE__ */ reactExports.forwardRef(function PopoverPositioner2(componentProps, forwardedRef) {
  const {
    render,
    className,
    anchor,
    positionMethod = "absolute",
    side = "bottom",
    align = "center",
    sideOffset = 0,
    alignOffset = 0,
    collisionBoundary = "clipping-ancestors",
    collisionPadding = 5,
    arrowPadding = 5,
    sticky = false,
    disableAnchorTracking = false,
    collisionAvoidance = POPUP_COLLISION_AVOIDANCE,
    ...elementProps
  } = componentProps;
  const {
    store
  } = usePopoverRootContext();
  const keepMounted = usePopoverPortalContext();
  const nodeId = useFloatingNodeId();
  const floatingRootContext = store.useState("floatingRootContext");
  const mounted = store.useState("mounted");
  const open = store.useState("open");
  const openReason = store.useState("openChangeReason");
  const triggerElement = store.useState("activeTriggerElement");
  const modal = store.useState("modal");
  const positionerElement = store.useState("positionerElement");
  const instantType = store.useState("instantType");
  const transitionStatus = store.useState("transitionStatus");
  const hasViewport = store.useState("hasViewport");
  const prevTriggerElementRef = reactExports.useRef(null);
  const runOnceAnimationsFinish = useAnimationsFinished(positionerElement, false, false);
  const positioning = useAnchorPositioning({
    anchor,
    floatingRootContext,
    positionMethod,
    mounted,
    side,
    sideOffset,
    align,
    alignOffset,
    arrowPadding,
    collisionBoundary,
    collisionPadding,
    sticky,
    disableAnchorTracking,
    keepMounted,
    nodeId,
    collisionAvoidance,
    adaptiveOrigin: hasViewport ? adaptiveOrigin : void 0
  });
  const defaultProps = reactExports.useMemo(() => {
    const hiddenStyles = {};
    if (!open) {
      hiddenStyles.pointerEvents = "none";
    }
    return {
      role: "presentation",
      hidden: !mounted,
      style: {
        ...positioning.positionerStyles,
        ...hiddenStyles
      }
    };
  }, [open, mounted, positioning.positionerStyles]);
  const positioner = reactExports.useMemo(() => ({
    props: defaultProps,
    ...positioning
  }), [defaultProps, positioning]);
  const domReference = floatingRootContext?.select("domReferenceElement");
  useIsoLayoutEffect(() => {
    const currentTriggerElement = domReference;
    const prevTriggerElement = prevTriggerElementRef.current;
    if (currentTriggerElement) {
      prevTriggerElementRef.current = currentTriggerElement;
    }
    if (prevTriggerElement && currentTriggerElement && currentTriggerElement !== prevTriggerElement) {
      store.set("instantType", void 0);
      const ac = new AbortController();
      runOnceAnimationsFinish(() => {
        store.set("instantType", "trigger-change");
      }, ac.signal);
      return () => {
        ac.abort();
      };
    }
    return void 0;
  }, [domReference, runOnceAnimationsFinish, store]);
  const state = reactExports.useMemo(() => ({
    open,
    side: positioner.side,
    align: positioner.align,
    anchorHidden: positioner.anchorHidden,
    instant: instantType
  }), [open, positioner.side, positioner.align, positioner.anchorHidden, instantType]);
  const setPositionerElement = reactExports.useCallback((element2) => {
    store.set("positionerElement", element2);
  }, [store]);
  const element = useRenderElement("div", componentProps, {
    state,
    props: [positioner.props, getDisabledMountTransitionStyles(transitionStatus), elementProps],
    ref: [forwardedRef, setPositionerElement],
    stateAttributesMapping: popupStateMapping
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(PopoverPositionerContext.Provider, {
    value: positioner,
    children: [mounted && modal === true && openReason !== triggerHover && /* @__PURE__ */ jsxRuntimeExports.jsx(InternalBackdrop, {
      ref: store.context.internalBackdropRef,
      inert: inertValue(!open),
      cutout: triggerElement
    }), /* @__PURE__ */ jsxRuntimeExports.jsx(FloatingNode, {
      id: nodeId,
      children: element
    })]
  });
});
const ToolbarRootContext = /* @__PURE__ */ reactExports.createContext(void 0);
function useToolbarRootContext(optional) {
  const context = reactExports.useContext(ToolbarRootContext);
  return context;
}
const stateAttributesMapping$3 = {
  ...popupStateMapping,
  ...transitionStatusMapping
};
const PopoverPopup = /* @__PURE__ */ reactExports.forwardRef(function PopoverPopup2(componentProps, forwardedRef) {
  const {
    className,
    render,
    initialFocus,
    finalFocus,
    ...elementProps
  } = componentProps;
  const {
    store
  } = usePopoverRootContext();
  const positioner = usePopoverPositionerContext();
  const insideToolbar = useToolbarRootContext() != null;
  const open = store.useState("open");
  const openMethod = store.useState("openMethod");
  const instantType = store.useState("instantType");
  const transitionStatus = store.useState("transitionStatus");
  const popupProps = store.useState("popupProps");
  const titleId = store.useState("titleElementId");
  const descriptionId = store.useState("descriptionElementId");
  const modal = store.useState("modal");
  const mounted = store.useState("mounted");
  const openReason = store.useState("openChangeReason");
  const activeTriggerElement = store.useState("activeTriggerElement");
  const floatingContext = store.useState("floatingRootContext");
  useOpenChangeComplete({
    open,
    ref: store.context.popupRef,
    onComplete() {
      if (open) {
        store.context.onOpenChangeComplete?.(true);
      }
    }
  });
  const disabled = store.useState("disabled");
  const openOnHover = store.useState("openOnHover");
  const closeDelay = store.useState("closeDelay");
  useHoverFloatingInteraction(floatingContext, {
    enabled: openOnHover && !disabled,
    closeDelay
  });
  function defaultInitialFocus(interactionType) {
    if (interactionType === "touch") {
      return store.context.popupRef.current;
    }
    return true;
  }
  const resolvedInitialFocus = initialFocus === void 0 ? defaultInitialFocus : initialFocus;
  const state = reactExports.useMemo(() => ({
    open,
    side: positioner.side,
    align: positioner.align,
    instant: instantType,
    transitionStatus
  }), [open, positioner.side, positioner.align, instantType, transitionStatus]);
  const setPopupElement = reactExports.useCallback((element2) => {
    store.set("popupElement", element2);
  }, [store]);
  const element = useRenderElement("div", componentProps, {
    state,
    ref: [forwardedRef, store.context.popupRef, setPopupElement],
    props: [popupProps, {
      "aria-labelledby": titleId,
      "aria-describedby": descriptionId,
      onKeyDown(event) {
        if (insideToolbar && COMPOSITE_KEYS.has(event.key)) {
          event.stopPropagation();
        }
      }
    }, getDisabledMountTransitionStyles(transitionStatus), elementProps],
    stateAttributesMapping: stateAttributesMapping$3
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(FloatingFocusManager, {
    context: floatingContext,
    openInteractionType: openMethod,
    modal: modal === "trap-focus",
    disabled: !mounted || openReason === triggerHover,
    initialFocus: resolvedInitialFocus,
    returnFocus: finalFocus,
    restoreFocus: "popup",
    previousFocusableElement: isHTMLElement(activeTriggerElement) ? activeTriggerElement : void 0,
    nextFocusableElement: store.context.triggerFocusTargetRef,
    beforeContentFocusGuardRef: store.context.beforeContentFocusGuardRef,
    children: element
  });
});
let FieldControlDataAttributes = /* @__PURE__ */ (function(FieldControlDataAttributes2) {
  FieldControlDataAttributes2["disabled"] = "data-disabled";
  FieldControlDataAttributes2["valid"] = "data-valid";
  FieldControlDataAttributes2["invalid"] = "data-invalid";
  FieldControlDataAttributes2["touched"] = "data-touched";
  FieldControlDataAttributes2["dirty"] = "data-dirty";
  FieldControlDataAttributes2["filled"] = "data-filled";
  FieldControlDataAttributes2["focused"] = "data-focused";
  return FieldControlDataAttributes2;
})({});
const DEFAULT_VALIDITY_STATE = {
  badInput: false,
  customError: false,
  patternMismatch: false,
  rangeOverflow: false,
  rangeUnderflow: false,
  stepMismatch: false,
  tooLong: false,
  tooShort: false,
  typeMismatch: false,
  valid: null,
  valueMissing: false
};
const fieldValidityMapping = {
  valid(value) {
    if (value === null) {
      return null;
    }
    if (value) {
      return {
        [FieldControlDataAttributes.valid]: ""
      };
    }
    return {
      [FieldControlDataAttributes.invalid]: ""
    };
  }
};
const FieldRootContext = /* @__PURE__ */ reactExports.createContext({
  invalid: void 0,
  name: void 0,
  validityData: {
    state: DEFAULT_VALIDITY_STATE,
    errors: [],
    error: "",
    value: "",
    initialValue: null
  },
  setValidityData: NOOP,
  disabled: void 0,
  touched: false,
  setTouched: NOOP,
  dirty: false,
  setDirty: NOOP,
  filled: false,
  setFilled: NOOP,
  focused: false,
  setFocused: NOOP,
  validate: () => null,
  validationMode: "onSubmit",
  validationDebounceTime: 0,
  shouldValidateOnChange: () => false,
  state: {
    disabled: false,
    valid: null,
    touched: false,
    dirty: false,
    filled: false,
    focused: false
  },
  markedDirtyRef: {
    current: false
  },
  validation: {
    getValidationProps: (props = EMPTY_OBJECT) => props,
    getInputValidationProps: (props = EMPTY_OBJECT) => props,
    inputRef: {
      current: null
    },
    commit: async () => {
    }
  }
});
function useFieldRootContext(optional = true) {
  const context = reactExports.useContext(FieldRootContext);
  if (context.setValidityData === NOOP && !optional) {
    throw new Error(formatErrorMessage(28));
  }
  return context;
}
const FormContext = /* @__PURE__ */ reactExports.createContext({
  formRef: {
    current: {
      fields: /* @__PURE__ */ new Map()
    }
  },
  errors: {},
  clearErrors: NOOP,
  validationMode: "onSubmit",
  submitAttemptedRef: {
    current: false
  }
});
function useFormContext() {
  return reactExports.useContext(FormContext);
}
const LabelableContext = /* @__PURE__ */ reactExports.createContext({
  controlId: void 0,
  setControlId: NOOP,
  labelId: void 0,
  setLabelId: NOOP,
  messageIds: [],
  setMessageIds: NOOP,
  getDescriptionProps: (externalProps) => externalProps
});
function useLabelableContext() {
  return reactExports.useContext(LabelableContext);
}
function getCombinedFieldValidityData(validityData, invalid) {
  return {
    ...validityData,
    state: {
      ...validityData.state,
      valid: !invalid && validityData.state.valid
    }
  };
}
function useLabelableId(params = {}) {
  const {
    id,
    implicit = false,
    controlRef
  } = params;
  const {
    controlId,
    setControlId
  } = useLabelableContext();
  const defaultId = useBaseUiId(id);
  useIsoLayoutEffect(() => {
    if (!implicit && !id || setControlId === NOOP) {
      return void 0;
    }
    if (implicit) {
      const elem = controlRef?.current;
      if (isElement(elem) && elem.closest("label") != null) {
        setControlId(id ?? null);
      } else {
        setControlId(controlId ?? defaultId);
      }
    } else if (id) {
      setControlId(id);
    }
    return () => {
      if (id) {
        setControlId(void 0);
      }
    };
  }, [id, controlRef, controlId, setControlId, implicit, defaultId]);
  return controlId ?? defaultId;
}
function useField(params) {
  const {
    enabled = true,
    value,
    id,
    name,
    controlRef,
    commit
  } = params;
  const {
    formRef
  } = useFormContext();
  const {
    invalid,
    markedDirtyRef,
    validityData,
    setValidityData
  } = useFieldRootContext();
  const getValue = useStableCallback(params.getValue);
  useIsoLayoutEffect(() => {
    if (!enabled) {
      return;
    }
    let initialValue = value;
    if (initialValue === void 0) {
      initialValue = getValue();
    }
    if (validityData.initialValue === null && initialValue !== null) {
      setValidityData((prev) => ({
        ...prev,
        initialValue
      }));
    }
  }, [enabled, setValidityData, value, validityData.initialValue, getValue]);
  useIsoLayoutEffect(() => {
    if (!enabled || !id) {
      return;
    }
    formRef.current.fields.set(id, {
      getValue,
      name,
      controlRef,
      validityData: getCombinedFieldValidityData(validityData, invalid),
      validate(flushSync = true) {
        let nextValue = value;
        if (nextValue === void 0) {
          nextValue = getValue();
        }
        markedDirtyRef.current = true;
        if (!flushSync) {
          commit(nextValue);
        } else {
          reactDomExports.flushSync(() => commit(nextValue));
        }
      }
    });
  }, [commit, controlRef, enabled, formRef, getValue, id, invalid, markedDirtyRef, name, validityData, value]);
  useIsoLayoutEffect(() => {
    const fields = formRef.current.fields;
    return () => {
      if (id) {
        fields.delete(id);
      }
    };
  }, [formRef, id]);
}
const FieldControl = /* @__PURE__ */ reactExports.forwardRef(function FieldControl2(componentProps, forwardedRef) {
  const {
    render,
    className,
    id: idProp,
    name: nameProp,
    value: valueProp,
    disabled: disabledProp = false,
    onValueChange,
    defaultValue,
    ...elementProps
  } = componentProps;
  const {
    state: fieldState,
    name: fieldName,
    disabled: fieldDisabled
  } = useFieldRootContext();
  const disabled = fieldDisabled || disabledProp;
  const name = fieldName ?? nameProp;
  const state = reactExports.useMemo(() => ({
    ...fieldState,
    disabled
  }), [fieldState, disabled]);
  const {
    setTouched,
    setDirty,
    validityData,
    setFocused,
    setFilled,
    validationMode,
    validation
  } = useFieldRootContext();
  const {
    labelId
  } = useLabelableContext();
  const id = useLabelableId({
    id: idProp
  });
  useIsoLayoutEffect(() => {
    const hasExternalValue = valueProp != null;
    if (validation.inputRef.current?.value || hasExternalValue && valueProp !== "") {
      setFilled(true);
    } else if (hasExternalValue && valueProp === "") {
      setFilled(false);
    }
  }, [validation.inputRef, setFilled, valueProp]);
  const [value, setValueUnwrapped] = useControlled({
    controlled: valueProp,
    default: defaultValue,
    name: "FieldControl",
    state: "value"
  });
  const isControlled = valueProp !== void 0;
  const setValue = useStableCallback((nextValue, eventDetails) => {
    onValueChange?.(nextValue, eventDetails);
    if (eventDetails.isCanceled) {
      return;
    }
    setValueUnwrapped(nextValue);
  });
  useField({
    id,
    name,
    commit: validation.commit,
    value,
    getValue: () => validation.inputRef.current?.value,
    controlRef: validation.inputRef
  });
  const element = useRenderElement("input", componentProps, {
    ref: forwardedRef,
    state,
    props: [{
      id,
      disabled,
      name,
      ref: validation.inputRef,
      "aria-labelledby": labelId,
      ...isControlled ? {
        value
      } : {
        defaultValue
      },
      onChange(event) {
        const inputValue = event.currentTarget.value;
        setValue(inputValue, createChangeEventDetails(none, event.nativeEvent));
        setDirty(inputValue !== validityData.initialValue);
        setFilled(inputValue !== "");
      },
      onFocus() {
        setFocused(true);
      },
      onBlur(event) {
        setTouched(true);
        setFocused(false);
        if (validationMode === "onBlur") {
          validation.commit(event.currentTarget.value);
        }
      },
      onKeyDown(event) {
        if (event.currentTarget.tagName === "INPUT" && event.key === "Enter") {
          setTouched(true);
          validation.commit(event.currentTarget.value);
        }
      }
    }, validation.getInputValidationProps(), elementProps],
    stateAttributesMapping: fieldValidityMapping
  });
  return element;
});
const FieldItemContext = /* @__PURE__ */ reactExports.createContext({
  disabled: false
});
function useFieldItemContext() {
  const context = reactExports.useContext(FieldItemContext);
  return context;
}
const CheckboxGroupContext = /* @__PURE__ */ reactExports.createContext(void 0);
function useCheckboxGroupContext(optional = true) {
  const context = reactExports.useContext(CheckboxGroupContext);
  if (context === void 0 && !optional) {
    throw new Error(formatErrorMessage(3));
  }
  return context;
}
const Input = /* @__PURE__ */ reactExports.forwardRef(function Input2(props, forwardedRef) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(FieldControl, {
    ref: forwardedRef,
    ...props
  });
});
let CheckboxRootDataAttributes = /* @__PURE__ */ (function(CheckboxRootDataAttributes2) {
  CheckboxRootDataAttributes2["checked"] = "data-checked";
  CheckboxRootDataAttributes2["unchecked"] = "data-unchecked";
  CheckboxRootDataAttributes2["indeterminate"] = "data-indeterminate";
  CheckboxRootDataAttributes2["disabled"] = "data-disabled";
  CheckboxRootDataAttributes2["readonly"] = "data-readonly";
  CheckboxRootDataAttributes2["required"] = "data-required";
  CheckboxRootDataAttributes2["valid"] = "data-valid";
  CheckboxRootDataAttributes2["invalid"] = "data-invalid";
  CheckboxRootDataAttributes2["touched"] = "data-touched";
  CheckboxRootDataAttributes2["dirty"] = "data-dirty";
  CheckboxRootDataAttributes2["filled"] = "data-filled";
  CheckboxRootDataAttributes2["focused"] = "data-focused";
  return CheckboxRootDataAttributes2;
})({});
function useStateAttributesMapping(state) {
  return reactExports.useMemo(() => ({
    checked(value) {
      if (state.indeterminate) {
        return {};
      }
      if (value) {
        return {
          [CheckboxRootDataAttributes.checked]: ""
        };
      }
      return {
        [CheckboxRootDataAttributes.unchecked]: ""
      };
    },
    ...fieldValidityMapping
  }), [state.indeterminate]);
}
const CheckboxRootContext = /* @__PURE__ */ reactExports.createContext(void 0);
function useCheckboxRootContext() {
  const context = reactExports.useContext(CheckboxRootContext);
  if (context === void 0) {
    throw new Error(formatErrorMessage(14));
  }
  return context;
}
function useValueChanged(value, onChange) {
  const valueRef = reactExports.useRef(value);
  const onChangeCallback = useStableCallback(onChange);
  useIsoLayoutEffect(() => {
    if (valueRef.current === value) {
      return;
    }
    onChangeCallback(valueRef.current);
  }, [value, onChangeCallback]);
  useIsoLayoutEffect(() => {
    valueRef.current = value;
  }, [value]);
}
const PARENT_CHECKBOX = "data-parent";
const CheckboxRoot = /* @__PURE__ */ reactExports.forwardRef(function CheckboxRoot2(componentProps, forwardedRef) {
  const {
    checked: checkedProp,
    className,
    defaultChecked = false,
    disabled: disabledProp = false,
    id: idProp,
    indeterminate = false,
    inputRef: inputRefProp,
    name: nameProp,
    onCheckedChange: onCheckedChangeProp,
    parent = false,
    readOnly = false,
    render,
    required = false,
    uncheckedValue,
    value: valueProp,
    nativeButton = false,
    ...elementProps
  } = componentProps;
  const {
    clearErrors
  } = useFormContext();
  const {
    disabled: rootDisabled,
    name: fieldName,
    setDirty,
    setFilled,
    setFocused,
    setTouched,
    state: fieldState,
    validationMode,
    validityData,
    shouldValidateOnChange,
    validation: localValidation
  } = useFieldRootContext();
  const fieldItemContext = useFieldItemContext();
  const {
    labelId,
    controlId,
    setControlId,
    getDescriptionProps
  } = useLabelableContext();
  const groupContext = useCheckboxGroupContext();
  const parentContext = groupContext?.parent;
  const isGroupedWithParent = parentContext && groupContext.allValues;
  const disabled = rootDisabled || fieldItemContext.disabled || groupContext?.disabled || disabledProp;
  const name = fieldName ?? nameProp;
  const value = valueProp ?? name;
  const id = useBaseUiId();
  const parentId = useBaseUiId();
  let inputId = controlId;
  if (isGroupedWithParent) {
    inputId = parent ? parentId : `${parentContext.id}-${value}`;
  } else if (idProp) {
    inputId = idProp;
  }
  let groupProps = {};
  if (isGroupedWithParent) {
    if (parent) {
      groupProps = groupContext.parent.getParentProps();
    } else if (value) {
      groupProps = groupContext.parent.getChildProps(value);
    }
  }
  const onCheckedChange = useStableCallback(onCheckedChangeProp);
  const {
    checked: groupChecked = checkedProp,
    indeterminate: groupIndeterminate = indeterminate,
    onCheckedChange: groupOnChange,
    ...otherGroupProps
  } = groupProps;
  const groupValue = groupContext?.value;
  const setGroupValue = groupContext?.setValue;
  const defaultGroupValue = groupContext?.defaultValue;
  const controlRef = reactExports.useRef(null);
  const {
    getButtonProps,
    buttonRef
  } = useButton({
    disabled,
    native: nativeButton
  });
  const validation = groupContext?.validation ?? localValidation;
  const [checked, setCheckedState] = useControlled({
    controlled: value && groupValue && !parent ? groupValue.includes(value) : groupChecked,
    default: value && defaultGroupValue && !parent ? defaultGroupValue.includes(value) : defaultChecked,
    name: "Checkbox",
    state: "checked"
  });
  useIsoLayoutEffect(() => {
    if (setControlId === NOOP) {
      return void 0;
    }
    setControlId(inputId);
    return () => {
      setControlId(void 0);
    };
  }, [inputId, groupContext, setControlId, parent]);
  useField({
    enabled: !groupContext,
    id,
    commit: validation.commit,
    value: checked,
    controlRef,
    name,
    getValue: () => checked
  });
  const inputRef = reactExports.useRef(null);
  const mergedInputRef = useMergedRefs(inputRefProp, inputRef, validation.inputRef);
  useIsoLayoutEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = groupIndeterminate;
      if (checked) {
        setFilled(true);
      }
    }
  }, [checked, groupIndeterminate, setFilled]);
  useValueChanged(checked, () => {
    if (groupContext && !parent) {
      return;
    }
    clearErrors(name);
    setFilled(checked);
    setDirty(checked !== validityData.initialValue);
    if (shouldValidateOnChange()) {
      validation.commit(checked);
    } else {
      validation.commit(checked, true);
    }
  });
  const inputProps = mergeProps$1(
    {
      checked,
      disabled,
      // parent checkboxes unset `name` to be excluded from form submission
      name: parent ? void 0 : name,
      // Set `id` to stop Chrome warning about an unassociated input.
      // When using a native button, the `id` is applied to the button instead.
      id: nativeButton ? void 0 : inputId ?? void 0,
      required,
      ref: mergedInputRef,
      style: name ? visuallyHiddenInput : visuallyHidden,
      tabIndex: -1,
      type: "checkbox",
      "aria-hidden": true,
      onChange(event) {
        if (event.nativeEvent.defaultPrevented) {
          return;
        }
        const nextChecked = event.target.checked;
        const details = createChangeEventDetails(none, event.nativeEvent);
        groupOnChange?.(nextChecked, details);
        onCheckedChange(nextChecked, details);
        if (details.isCanceled) {
          return;
        }
        setCheckedState(nextChecked);
        if (value && groupValue && setGroupValue && !parent) {
          const nextGroupValue = nextChecked ? [...groupValue, value] : groupValue.filter((item) => item !== value);
          setGroupValue(nextGroupValue, details);
        }
      },
      onFocus() {
        controlRef.current?.focus();
      }
    },
    // React <19 sets an empty value if `undefined` is passed explicitly
    // To avoid this, we only set the value if it's defined
    valueProp !== void 0 ? {
      value: (groupContext ? checked && valueProp : valueProp) || ""
    } : EMPTY_OBJECT,
    getDescriptionProps,
    groupContext ? validation.getValidationProps : validation.getInputValidationProps
  );
  const computedChecked = isGroupedWithParent ? Boolean(groupChecked) : checked;
  const computedIndeterminate = isGroupedWithParent ? groupIndeterminate || indeterminate : indeterminate;
  reactExports.useEffect(() => {
    if (parentContext && value) {
      parentContext.disabledStatesRef.current.set(value, disabled);
    }
  }, [parentContext, disabled, value]);
  const state = reactExports.useMemo(() => ({
    ...fieldState,
    checked: computedChecked,
    disabled,
    readOnly,
    required,
    indeterminate: computedIndeterminate
  }), [fieldState, computedChecked, disabled, readOnly, required, computedIndeterminate]);
  const stateAttributesMapping2 = useStateAttributesMapping(state);
  const element = useRenderElement("span", componentProps, {
    state,
    ref: [buttonRef, controlRef, forwardedRef, groupContext?.registerControlRef],
    props: [{
      id: nativeButton ? inputId ?? void 0 : id,
      role: "checkbox",
      "aria-checked": groupIndeterminate ? "mixed" : checked,
      "aria-readonly": readOnly || void 0,
      "aria-required": required || void 0,
      "aria-labelledby": labelId,
      [PARENT_CHECKBOX]: parent ? "" : void 0,
      onFocus() {
        setFocused(true);
      },
      onBlur() {
        const inputEl = inputRef.current;
        if (!inputEl) {
          return;
        }
        setTouched(true);
        setFocused(false);
        if (validationMode === "onBlur") {
          validation.commit(groupContext ? groupValue : inputEl.checked);
        }
      },
      onClick(event) {
        if (readOnly || disabled) {
          return;
        }
        event.preventDefault();
        inputRef.current?.click();
      }
    }, getDescriptionProps, validation.getValidationProps, elementProps, otherGroupProps, getButtonProps],
    stateAttributesMapping: stateAttributesMapping2
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(CheckboxRootContext.Provider, {
    value: state,
    children: [element, !checked && !groupContext && name && !parent && uncheckedValue !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("input", {
      type: "hidden",
      name,
      value: uncheckedValue
    }), /* @__PURE__ */ jsxRuntimeExports.jsx("input", {
      ...inputProps
    })]
  });
});
const CheckboxIndicator = /* @__PURE__ */ reactExports.forwardRef(function CheckboxIndicator2(componentProps, forwardedRef) {
  const {
    render,
    className,
    keepMounted = false,
    ...elementProps
  } = componentProps;
  const rootState = useCheckboxRootContext();
  const rendered = rootState.checked || rootState.indeterminate;
  const {
    transitionStatus,
    setMounted
  } = useTransitionStatus(rendered);
  const indicatorRef = reactExports.useRef(null);
  const state = reactExports.useMemo(() => ({
    ...rootState,
    transitionStatus
  }), [rootState, transitionStatus]);
  useOpenChangeComplete({
    open: rendered,
    ref: indicatorRef,
    onComplete() {
      if (!rendered) {
        setMounted(false);
      }
    }
  });
  const baseStateAttributesMapping = useStateAttributesMapping(rootState);
  const stateAttributesMapping2 = reactExports.useMemo(() => ({
    ...baseStateAttributesMapping,
    ...transitionStatusMapping,
    ...fieldValidityMapping
  }), [baseStateAttributesMapping]);
  const shouldRender = keepMounted || rendered;
  const element = useRenderElement("span", componentProps, {
    enabled: shouldRender,
    ref: [forwardedRef, indicatorRef],
    state,
    stateAttributesMapping: stateAttributesMapping2,
    props: elementProps
  });
  if (!shouldRender) {
    return null;
  }
  return element;
});
const SelectRootContext = /* @__PURE__ */ reactExports.createContext(null);
const SelectFloatingContext = /* @__PURE__ */ reactExports.createContext(null);
function useSelectRootContext() {
  const context = reactExports.useContext(SelectRootContext);
  if (context === null) {
    throw new Error(formatErrorMessage(60));
  }
  return context;
}
function useSelectFloatingContext() {
  const context = reactExports.useContext(SelectFloatingContext);
  if (context === null) {
    throw new Error(formatErrorMessage(61));
  }
  return context;
}
const defaultItemEquality = (item, value) => Object.is(item, value);
function compareItemEquality(item, value, comparer) {
  if (item == null || value == null) {
    return Object.is(item, value);
  }
  return comparer(item, value);
}
function itemIncludes(collection, value, comparer) {
  if (!collection || collection.length === 0) {
    return false;
  }
  return collection.some((item) => {
    if (item === void 0) {
      return false;
    }
    return compareItemEquality(item, value, comparer);
  });
}
function findItemIndex(collection, value, comparer) {
  if (!collection || collection.length === 0) {
    return -1;
  }
  return collection.findIndex((item) => {
    if (item === void 0) {
      return false;
    }
    return compareItemEquality(item, value, comparer);
  });
}
function removeItem(collection, value, comparer) {
  return collection.filter((item) => !compareItemEquality(item, value, comparer));
}
function serializeValue(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
function isGroupedItems(items) {
  return items != null && items.length > 0 && typeof items[0] === "object" && items[0] != null && "items" in items[0];
}
function hasNullItemLabel(items) {
  if (!Array.isArray(items)) {
    return items != null && !("null" in items);
  }
  if (isGroupedItems(items)) {
    for (const group of items) {
      for (const item of group.items) {
        if (item && item.value == null && item.label != null) {
          return true;
        }
      }
    }
    return false;
  }
  for (const item of items) {
    if (item && item.value == null && item.label != null) {
      return true;
    }
  }
  return false;
}
function stringifyAsLabel(item, itemToStringLabel) {
  if (itemToStringLabel && item != null) {
    return itemToStringLabel(item) ?? "";
  }
  if (item && typeof item === "object") {
    if ("label" in item && item.label != null) {
      return String(item.label);
    }
    if ("value" in item) {
      return String(item.value);
    }
  }
  return serializeValue(item);
}
function stringifyAsValue(item, itemToStringValue) {
  if (itemToStringValue && item != null) {
    return itemToStringValue(item) ?? "";
  }
  if (item && typeof item === "object" && "value" in item && "label" in item) {
    return serializeValue(item.value);
  }
  return serializeValue(item);
}
function resolveSelectedLabel(value, items, itemToStringLabel) {
  function fallback() {
    return stringifyAsLabel(value, itemToStringLabel);
  }
  if (itemToStringLabel && value != null) {
    return itemToStringLabel(value);
  }
  if (value && typeof value === "object" && "label" in value && value.label != null) {
    return value.label;
  }
  if (items && !Array.isArray(items)) {
    return items[value] ?? fallback();
  }
  if (Array.isArray(items)) {
    const flatItems = isGroupedItems(items) ? items.flatMap((g) => g.items) : items;
    if (value == null || typeof value !== "object") {
      const match = flatItems.find((item) => item.value === value);
      if (match && match.label != null) {
        return match.label;
      }
      return fallback();
    }
    if ("value" in value) {
      const match = flatItems.find((item) => item && item.value === value.value);
      if (match && match.label != null) {
        return match.label;
      }
    }
  }
  return fallback();
}
function resolveMultipleLabels(values, items, itemToStringLabel) {
  return values.reduce((acc, value, index) => {
    if (index > 0) {
      acc.push(", ");
    }
    acc.push(/* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.Fragment, {
      children: resolveSelectedLabel(value, items, itemToStringLabel)
    }, index));
    return acc;
  }, []);
}
const selectors = {
  id: createSelector((state) => state.id),
  modal: createSelector((state) => state.modal),
  multiple: createSelector((state) => state.multiple),
  items: createSelector((state) => state.items),
  itemToStringLabel: createSelector((state) => state.itemToStringLabel),
  itemToStringValue: createSelector((state) => state.itemToStringValue),
  isItemEqualToValue: createSelector((state) => state.isItemEqualToValue),
  value: createSelector((state) => state.value),
  hasSelectedValue: createSelector((state) => {
    const {
      value,
      multiple,
      itemToStringValue
    } = state;
    if (value == null) {
      return false;
    }
    if (multiple && Array.isArray(value)) {
      return value.length > 0;
    }
    return stringifyAsValue(value, itemToStringValue) !== "";
  }),
  hasNullItemLabel: createSelector((state, enabled) => {
    return enabled ? hasNullItemLabel(state.items) : false;
  }),
  open: createSelector((state) => state.open),
  mounted: createSelector((state) => state.mounted),
  forceMount: createSelector((state) => state.forceMount),
  transitionStatus: createSelector((state) => state.transitionStatus),
  openMethod: createSelector((state) => state.openMethod),
  activeIndex: createSelector((state) => state.activeIndex),
  selectedIndex: createSelector((state) => state.selectedIndex),
  isActive: createSelector((state, index) => state.activeIndex === index),
  isSelected: createSelector((state, index, candidate) => {
    const comparer = state.isItemEqualToValue;
    const storeValue = state.value;
    if (state.multiple) {
      return Array.isArray(storeValue) && storeValue.some((item) => compareItemEquality(item, candidate, comparer));
    }
    if (state.selectedIndex === index && state.selectedIndex !== null) {
      return true;
    }
    return compareItemEquality(storeValue, candidate, comparer);
  }),
  isSelectedByFocus: createSelector((state, index) => {
    return state.selectedIndex === index;
  }),
  popupProps: createSelector((state) => state.popupProps),
  triggerProps: createSelector((state) => state.triggerProps),
  triggerElement: createSelector((state) => state.triggerElement),
  positionerElement: createSelector((state) => state.positionerElement),
  listElement: createSelector((state) => state.listElement),
  scrollUpArrowVisible: createSelector((state) => state.scrollUpArrowVisible),
  scrollDownArrowVisible: createSelector((state) => state.scrollDownArrowVisible),
  hasScrollArrows: createSelector((state) => state.hasScrollArrows)
};
function SelectRoot(props) {
  const {
    id,
    value: valueProp,
    defaultValue = null,
    onValueChange,
    open: openProp,
    defaultOpen = false,
    onOpenChange,
    name: nameProp,
    disabled: disabledProp = false,
    readOnly = false,
    required = false,
    modal = true,
    actionsRef,
    inputRef,
    onOpenChangeComplete,
    items,
    multiple = false,
    itemToStringLabel,
    itemToStringValue,
    isItemEqualToValue = defaultItemEquality,
    highlightItemOnHover = true,
    children
  } = props;
  const {
    clearErrors
  } = useFormContext();
  const {
    setDirty,
    setTouched,
    setFocused,
    shouldValidateOnChange,
    validityData,
    setFilled,
    name: fieldName,
    disabled: fieldDisabled,
    validation,
    validationMode
  } = useFieldRootContext();
  const generatedId = useLabelableId({
    id
  });
  const disabled = fieldDisabled || disabledProp;
  const name = fieldName ?? nameProp;
  const [value, setValueUnwrapped] = useControlled({
    controlled: valueProp,
    default: multiple ? defaultValue ?? EMPTY_ARRAY : defaultValue,
    name: "Select",
    state: "value"
  });
  const [open, setOpenUnwrapped] = useControlled({
    controlled: openProp,
    default: defaultOpen,
    name: "Select",
    state: "open"
  });
  const listRef = reactExports.useRef([]);
  const labelsRef = reactExports.useRef([]);
  const popupRef = reactExports.useRef(null);
  const scrollHandlerRef = reactExports.useRef(null);
  const scrollArrowsMountedCountRef = reactExports.useRef(0);
  const valueRef = reactExports.useRef(null);
  const valuesRef = reactExports.useRef([]);
  const typingRef = reactExports.useRef(false);
  const keyboardActiveRef = reactExports.useRef(false);
  const selectedItemTextRef = reactExports.useRef(null);
  const selectionRef = reactExports.useRef({
    allowSelectedMouseUp: false,
    allowUnselectedMouseUp: false
  });
  const alignItemWithTriggerActiveRef = reactExports.useRef(false);
  const {
    mounted,
    setMounted,
    transitionStatus
  } = useTransitionStatus(open);
  const {
    openMethod,
    triggerProps: interactionTypeProps,
    reset: resetOpenInteractionType
  } = useOpenInteractionType(open);
  const store = useRefWithInit(() => new Store({
    id: generatedId,
    modal,
    multiple,
    itemToStringLabel,
    itemToStringValue,
    isItemEqualToValue,
    value,
    open,
    mounted,
    transitionStatus,
    items,
    forceMount: false,
    openMethod: null,
    activeIndex: null,
    selectedIndex: null,
    popupProps: {},
    triggerProps: {},
    triggerElement: null,
    positionerElement: null,
    listElement: null,
    scrollUpArrowVisible: false,
    scrollDownArrowVisible: false,
    hasScrollArrows: false
  })).current;
  const activeIndex = useStore(store, selectors.activeIndex);
  const selectedIndex = useStore(store, selectors.selectedIndex);
  const triggerElement = useStore(store, selectors.triggerElement);
  const positionerElement = useStore(store, selectors.positionerElement);
  const serializedValue = reactExports.useMemo(() => {
    if (multiple && Array.isArray(value) && value.length === 0) {
      return "";
    }
    return stringifyAsValue(value, itemToStringValue);
  }, [multiple, value, itemToStringValue]);
  const fieldStringValue = reactExports.useMemo(() => {
    if (multiple && Array.isArray(value)) {
      return value.map((currentValue) => stringifyAsValue(currentValue, itemToStringValue));
    }
    return stringifyAsValue(value, itemToStringValue);
  }, [multiple, value, itemToStringValue]);
  const controlRef = useValueAsRef(store.state.triggerElement);
  useField({
    id: generatedId,
    commit: validation.commit,
    value,
    controlRef,
    name,
    getValue: () => fieldStringValue
  });
  const initialValueRef = reactExports.useRef(value);
  useIsoLayoutEffect(() => {
    if (value !== initialValueRef.current) {
      store.set("forceMount", true);
    }
  }, [store, value]);
  useIsoLayoutEffect(() => {
    setFilled(multiple ? Array.isArray(value) && value.length > 0 : value != null);
  }, [multiple, value, setFilled]);
  useIsoLayoutEffect(function syncSelectedIndex() {
    if (open) {
      return;
    }
    const registry = valuesRef.current;
    if (multiple) {
      const currentValue = Array.isArray(value) ? value : [];
      if (currentValue.length === 0) {
        store.set("selectedIndex", null);
        return;
      }
      const lastValue = currentValue[currentValue.length - 1];
      const lastIndex = findItemIndex(registry, lastValue, isItemEqualToValue);
      store.set("selectedIndex", lastIndex === -1 ? null : lastIndex);
      return;
    }
    const index = findItemIndex(registry, value, isItemEqualToValue);
    store.set("selectedIndex", index === -1 ? null : index);
  }, [multiple, open, value, valuesRef, isItemEqualToValue, store]);
  useValueChanged(value, () => {
    clearErrors(name);
    setDirty(value !== validityData.initialValue);
    if (shouldValidateOnChange()) {
      validation.commit(value);
    } else {
      validation.commit(value, true);
    }
  });
  const setOpen = useStableCallback((nextOpen, eventDetails) => {
    onOpenChange?.(nextOpen, eventDetails);
    if (eventDetails.isCanceled) {
      return;
    }
    setOpenUnwrapped(nextOpen);
    if (!nextOpen && (eventDetails.reason === focusOut || eventDetails.reason === outsidePress)) {
      setTouched(true);
      setFocused(false);
      if (validationMode === "onBlur") {
        validation.commit(value);
      }
    }
    if (!nextOpen && store.state.activeIndex !== null) {
      const activeOption = listRef.current[store.state.activeIndex];
      queueMicrotask(() => {
        activeOption?.setAttribute("tabindex", "-1");
      });
    }
  });
  const handleUnmount = useStableCallback(() => {
    setMounted(false);
    store.set("activeIndex", null);
    resetOpenInteractionType();
    onOpenChangeComplete?.(false);
  });
  useOpenChangeComplete({
    enabled: !actionsRef,
    open,
    ref: popupRef,
    onComplete() {
      if (!open) {
        handleUnmount();
      }
    }
  });
  reactExports.useImperativeHandle(actionsRef, () => ({
    unmount: handleUnmount
  }), [handleUnmount]);
  const setValue = useStableCallback((nextValue, eventDetails) => {
    onValueChange?.(nextValue, eventDetails);
    if (eventDetails.isCanceled) {
      return;
    }
    setValueUnwrapped(nextValue);
  });
  const handleScrollArrowVisibility = useStableCallback(() => {
    const scroller = store.state.listElement || popupRef.current;
    if (!scroller) {
      return;
    }
    const viewportTop = scroller.scrollTop;
    const viewportBottom = scroller.scrollTop + scroller.clientHeight;
    const shouldShowUp = viewportTop > 1;
    const shouldShowDown = viewportBottom < scroller.scrollHeight - 1;
    if (store.state.scrollUpArrowVisible !== shouldShowUp) {
      store.set("scrollUpArrowVisible", shouldShowUp);
    }
    if (store.state.scrollDownArrowVisible !== shouldShowDown) {
      store.set("scrollDownArrowVisible", shouldShowDown);
    }
  });
  const floatingContext = useFloatingRootContext({
    open,
    onOpenChange: setOpen,
    elements: {
      reference: triggerElement,
      floating: positionerElement
    }
  });
  const click = useClick(floatingContext, {
    enabled: !readOnly && !disabled,
    event: "mousedown"
  });
  const dismiss = useDismiss(floatingContext, {
    bubbles: false
  });
  const listNavigation2 = useListNavigation(floatingContext, {
    enabled: !readOnly && !disabled,
    listRef,
    activeIndex,
    selectedIndex,
    disabledIndices: EMPTY_ARRAY,
    onNavigate(nextActiveIndex) {
      if (nextActiveIndex === null && !open) {
        return;
      }
      store.set("activeIndex", nextActiveIndex);
    },
    // Implement our own listeners since `onPointerLeave` on each option fires while scrolling with
    // the `alignItemWithTrigger=true`, causing a performance issue on Chrome.
    focusItemOnHover: false
  });
  const typeahead = useTypeahead(floatingContext, {
    enabled: !readOnly && !disabled && (open || !multiple),
    listRef: labelsRef,
    activeIndex,
    selectedIndex,
    onMatch(index) {
      if (open) {
        store.set("activeIndex", index);
      } else {
        setValue(valuesRef.current[index], createChangeEventDetails("none"));
      }
    },
    onTypingChange(typing) {
      typingRef.current = typing;
    }
  });
  const {
    getReferenceProps,
    getFloatingProps,
    getItemProps
  } = useInteractions([click, dismiss, listNavigation2, typeahead]);
  const mergedTriggerProps = reactExports.useMemo(() => {
    return mergeProps$1(getReferenceProps(), interactionTypeProps, generatedId ? {
      id: generatedId
    } : EMPTY_OBJECT);
  }, [getReferenceProps, interactionTypeProps, generatedId]);
  useOnFirstRender(() => {
    store.update({
      popupProps: getFloatingProps(),
      triggerProps: mergedTriggerProps
    });
  });
  useIsoLayoutEffect(() => {
    store.update({
      id: generatedId,
      modal,
      multiple,
      value,
      open,
      mounted,
      transitionStatus,
      popupProps: getFloatingProps(),
      triggerProps: mergedTriggerProps,
      items,
      itemToStringLabel,
      itemToStringValue,
      isItemEqualToValue,
      openMethod
    });
  }, [store, generatedId, modal, multiple, value, open, mounted, transitionStatus, getFloatingProps, mergedTriggerProps, items, itemToStringLabel, itemToStringValue, isItemEqualToValue, openMethod]);
  const contextValue = reactExports.useMemo(() => ({
    store,
    name,
    required,
    disabled,
    readOnly,
    multiple,
    itemToStringLabel,
    itemToStringValue,
    highlightItemOnHover,
    setValue,
    setOpen,
    listRef,
    popupRef,
    scrollHandlerRef,
    handleScrollArrowVisibility,
    scrollArrowsMountedCountRef,
    getItemProps,
    events: floatingContext.context.events,
    valueRef,
    valuesRef,
    labelsRef,
    typingRef,
    selectionRef,
    selectedItemTextRef,
    validation,
    onOpenChangeComplete,
    keyboardActiveRef,
    alignItemWithTriggerActiveRef,
    initialValueRef
  }), [store, name, required, disabled, readOnly, multiple, itemToStringLabel, itemToStringValue, highlightItemOnHover, setValue, setOpen, getItemProps, floatingContext.context.events, validation, onOpenChangeComplete, handleScrollArrowVisibility]);
  const ref = useMergedRefs(inputRef, validation.inputRef);
  const hasMultipleSelection = multiple && Array.isArray(value) && value.length > 0;
  const hiddenInputs = reactExports.useMemo(() => {
    if (!multiple || !Array.isArray(value) || !name) {
      return null;
    }
    return value.map((v) => {
      const currentSerializedValue = stringifyAsValue(v, itemToStringValue);
      return /* @__PURE__ */ jsxRuntimeExports.jsx("input", {
        type: "hidden",
        name,
        value: currentSerializedValue
      }, currentSerializedValue);
    });
  }, [multiple, value, name, itemToStringValue]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(SelectRootContext.Provider, {
    value: contextValue,
    children: /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectFloatingContext.Provider, {
      value: floatingContext,
      children: [children, /* @__PURE__ */ jsxRuntimeExports.jsx("input", {
        ...validation.getInputValidationProps({
          onFocus() {
            store.state.triggerElement?.focus({
              // Supported in Chrome from 144 (January 2026)
              // @ts-expect-error - focusVisible is not yet in the lib.dom.d.ts
              focusVisible: true
            });
          },
          // Handle browser autofill.
          onChange(event) {
            if (event.nativeEvent.defaultPrevented) {
              return;
            }
            const nextValue = event.target.value;
            const details = createChangeEventDetails(none, event.nativeEvent);
            function handleChange() {
              if (multiple) {
                return;
              }
              const matchingValue = valuesRef.current.find((v) => {
                const candidate = stringifyAsValue(v, itemToStringValue);
                if (candidate.toLowerCase() === nextValue.toLowerCase()) {
                  return true;
                }
                return false;
              });
              if (matchingValue != null) {
                setDirty(matchingValue !== validityData.initialValue);
                setValue(matchingValue, details);
                if (shouldValidateOnChange()) {
                  validation.commit(matchingValue);
                }
              }
            }
            store.set("forceMount", true);
            queueMicrotask(handleChange);
          }
        }),
        name: multiple ? void 0 : name,
        value: serializedValue,
        disabled,
        required: required && !hasMultipleSelection,
        readOnly,
        ref,
        style: name ? visuallyHiddenInput : visuallyHidden,
        tabIndex: -1,
        "aria-hidden": true
      }), hiddenInputs]
    })
  });
}
function getPseudoElementBounds(element) {
  const elementRect = element.getBoundingClientRect();
  const beforeStyles = window.getComputedStyle(element, "::before");
  const afterStyles = window.getComputedStyle(element, "::after");
  const hasPseudoElements = beforeStyles.content !== "none" || afterStyles.content !== "none";
  if (!hasPseudoElements) {
    return elementRect;
  }
  const beforeWidth = parseFloat(beforeStyles.width) || 0;
  const beforeHeight = parseFloat(beforeStyles.height) || 0;
  const afterWidth = parseFloat(afterStyles.width) || 0;
  const afterHeight = parseFloat(afterStyles.height) || 0;
  const totalWidth = Math.max(elementRect.width, beforeWidth, afterWidth);
  const totalHeight = Math.max(elementRect.height, beforeHeight, afterHeight);
  const widthDiff = totalWidth - elementRect.width;
  const heightDiff = totalHeight - elementRect.height;
  return {
    left: elementRect.left - widthDiff / 2,
    right: elementRect.right + widthDiff / 2,
    top: elementRect.top - heightDiff / 2,
    bottom: elementRect.bottom + heightDiff / 2
  };
}
const BOUNDARY_OFFSET = 2;
const SELECTED_DELAY = 400;
const UNSELECTED_DELAY = 200;
const stateAttributesMapping$2 = {
  ...pressableTriggerOpenStateMapping,
  ...fieldValidityMapping,
  value: () => null
};
const SelectTrigger = /* @__PURE__ */ reactExports.forwardRef(function SelectTrigger2(componentProps, forwardedRef) {
  const {
    render,
    className,
    id: idProp,
    disabled: disabledProp = false,
    nativeButton = true,
    ...elementProps
  } = componentProps;
  const {
    setTouched,
    setFocused,
    validationMode,
    state: fieldState,
    disabled: fieldDisabled
  } = useFieldRootContext();
  const {
    labelId
  } = useLabelableContext();
  const {
    store,
    setOpen,
    selectionRef,
    validation,
    readOnly,
    required,
    alignItemWithTriggerActiveRef,
    disabled: selectDisabled,
    keyboardActiveRef
  } = useSelectRootContext();
  const disabled = fieldDisabled || selectDisabled || disabledProp;
  const open = useStore(store, selectors.open);
  const value = useStore(store, selectors.value);
  const triggerProps = useStore(store, selectors.triggerProps);
  const positionerElement = useStore(store, selectors.positionerElement);
  const listElement = useStore(store, selectors.listElement);
  const rootId = useStore(store, selectors.id);
  const hasSelectedValue = useStore(store, selectors.hasSelectedValue);
  const shouldCheckNullItemLabel = !hasSelectedValue && open;
  const hasNullItemLabel2 = useStore(store, selectors.hasNullItemLabel, shouldCheckNullItemLabel);
  const id = idProp ?? rootId;
  useLabelableId({
    id
  });
  const positionerRef = useValueAsRef(positionerElement);
  const triggerRef = reactExports.useRef(null);
  const {
    getButtonProps,
    buttonRef
  } = useButton({
    disabled,
    native: nativeButton
  });
  const setTriggerElement = useStableCallback((element) => {
    store.set("triggerElement", element);
  });
  const mergedRef = useMergedRefs(forwardedRef, triggerRef, buttonRef, setTriggerElement);
  const timeoutFocus = useTimeout();
  const timeoutMouseDown = useTimeout();
  const selectedDelayTimeout = useTimeout();
  const unselectedDelayTimeout = useTimeout();
  reactExports.useEffect(() => {
    if (open) {
      const hasSelectedItemInList = hasSelectedValue || hasNullItemLabel2;
      const shouldDelayUnselectedMouseUpLonger = !hasSelectedItemInList;
      if (shouldDelayUnselectedMouseUpLonger) {
        selectedDelayTimeout.start(SELECTED_DELAY, () => {
          selectionRef.current.allowUnselectedMouseUp = true;
          selectionRef.current.allowSelectedMouseUp = true;
        });
      } else {
        unselectedDelayTimeout.start(UNSELECTED_DELAY, () => {
          selectionRef.current.allowUnselectedMouseUp = true;
          selectedDelayTimeout.start(UNSELECTED_DELAY, () => {
            selectionRef.current.allowSelectedMouseUp = true;
          });
        });
      }
      return () => {
        selectedDelayTimeout.clear();
        unselectedDelayTimeout.clear();
      };
    }
    selectionRef.current = {
      allowSelectedMouseUp: false,
      allowUnselectedMouseUp: false
    };
    timeoutMouseDown.clear();
    return void 0;
  }, [open, hasSelectedValue, hasNullItemLabel2, selectionRef, timeoutMouseDown, selectedDelayTimeout, unselectedDelayTimeout]);
  const ariaControlsId = reactExports.useMemo(() => {
    return listElement?.id ?? getFloatingFocusElement(positionerElement)?.id;
  }, [listElement, positionerElement]);
  const props = mergeProps$1(triggerProps, {
    id,
    role: "combobox",
    "aria-expanded": open ? "true" : "false",
    "aria-haspopup": "listbox",
    "aria-controls": open ? ariaControlsId : void 0,
    "aria-labelledby": labelId,
    "aria-readonly": readOnly || void 0,
    "aria-required": required || void 0,
    tabIndex: disabled ? -1 : 0,
    ref: mergedRef,
    onFocus(event) {
      setFocused(true);
      if (open && alignItemWithTriggerActiveRef.current) {
        setOpen(false, createChangeEventDetails(none, event.nativeEvent));
      }
      timeoutFocus.start(0, () => {
        store.set("forceMount", true);
      });
    },
    onBlur(event) {
      if (contains(positionerElement, event.relatedTarget)) {
        return;
      }
      setTouched(true);
      setFocused(false);
      if (validationMode === "onBlur") {
        validation.commit(value);
      }
    },
    onPointerMove() {
      keyboardActiveRef.current = false;
    },
    onKeyDown() {
      keyboardActiveRef.current = true;
    },
    onMouseDown(event) {
      if (open) {
        return;
      }
      const doc = ownerDocument(event.currentTarget);
      function handleMouseUp(mouseEvent) {
        if (!triggerRef.current) {
          return;
        }
        const mouseUpTarget = mouseEvent.target;
        if (contains(triggerRef.current, mouseUpTarget) || contains(positionerRef.current, mouseUpTarget) || mouseUpTarget === triggerRef.current) {
          return;
        }
        const bounds = getPseudoElementBounds(triggerRef.current);
        if (mouseEvent.clientX >= bounds.left - BOUNDARY_OFFSET && mouseEvent.clientX <= bounds.right + BOUNDARY_OFFSET && mouseEvent.clientY >= bounds.top - BOUNDARY_OFFSET && mouseEvent.clientY <= bounds.bottom + BOUNDARY_OFFSET) {
          return;
        }
        setOpen(false, createChangeEventDetails(cancelOpen, mouseEvent));
      }
      timeoutMouseDown.start(0, () => {
        doc.addEventListener("mouseup", handleMouseUp, {
          once: true
        });
      });
    }
  }, validation.getValidationProps, elementProps, getButtonProps);
  props.role = "combobox";
  const state = reactExports.useMemo(() => ({
    ...fieldState,
    open,
    disabled,
    value,
    readOnly,
    placeholder: !hasSelectedValue
  }), [fieldState, open, disabled, value, readOnly, hasSelectedValue]);
  return useRenderElement("button", componentProps, {
    ref: [forwardedRef, triggerRef],
    state,
    stateAttributesMapping: stateAttributesMapping$2,
    props
  });
});
const stateAttributesMapping$1 = {
  value: () => null
};
const SelectValue = /* @__PURE__ */ reactExports.forwardRef(function SelectValue2(componentProps, forwardedRef) {
  const {
    className,
    render,
    children: childrenProp,
    placeholder,
    ...elementProps
  } = componentProps;
  const {
    store,
    valueRef
  } = useSelectRootContext();
  const value = useStore(store, selectors.value);
  const items = useStore(store, selectors.items);
  const itemToStringLabel = useStore(store, selectors.itemToStringLabel);
  const hasSelectedValue = useStore(store, selectors.hasSelectedValue);
  const shouldCheckNullItemLabel = !hasSelectedValue && placeholder != null && childrenProp == null;
  const hasNullLabel = useStore(store, selectors.hasNullItemLabel, shouldCheckNullItemLabel);
  const state = reactExports.useMemo(() => ({
    value,
    placeholder: !hasSelectedValue
  }), [value, hasSelectedValue]);
  let children = null;
  if (typeof childrenProp === "function") {
    children = childrenProp(value);
  } else if (childrenProp != null) {
    children = childrenProp;
  } else if (!hasSelectedValue && placeholder != null && !hasNullLabel) {
    children = placeholder;
  } else if (Array.isArray(value)) {
    children = resolveMultipleLabels(value, items, itemToStringLabel);
  } else {
    children = resolveSelectedLabel(value, items, itemToStringLabel);
  }
  const element = useRenderElement("span", componentProps, {
    state,
    ref: [forwardedRef, valueRef],
    props: [{
      children
    }, elementProps],
    stateAttributesMapping: stateAttributesMapping$1
  });
  return element;
});
const SelectIcon = /* @__PURE__ */ reactExports.forwardRef(function SelectIcon2(componentProps, forwardedRef) {
  const {
    className,
    render,
    ...elementProps
  } = componentProps;
  const {
    store
  } = useSelectRootContext();
  const open = useStore(store, selectors.open);
  const state = reactExports.useMemo(() => ({
    open
  }), [open]);
  const element = useRenderElement("span", componentProps, {
    state,
    ref: forwardedRef,
    props: [{
      "aria-hidden": true,
      children: "▼"
    }, elementProps],
    stateAttributesMapping: triggerOpenStateMapping
  });
  return element;
});
const SelectPortalContext = /* @__PURE__ */ reactExports.createContext(void 0);
const SelectPortal = /* @__PURE__ */ reactExports.forwardRef(function SelectPortal2(portalProps, forwardedRef) {
  const {
    store
  } = useSelectRootContext();
  const mounted = useStore(store, selectors.mounted);
  const forceMount = useStore(store, selectors.forceMount);
  const shouldRender = mounted || forceMount;
  if (!shouldRender) {
    return null;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(SelectPortalContext.Provider, {
    value: true,
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(FloatingPortal, {
      ref: forwardedRef,
      ...portalProps
    })
  });
});
const CompositeListContext = /* @__PURE__ */ reactExports.createContext({
  register: () => {
  },
  unregister: () => {
  },
  subscribeMapChange: () => {
    return () => {
    };
  },
  elementsRef: {
    current: []
  },
  nextIndexRef: {
    current: 0
  }
});
function useCompositeListContext() {
  return reactExports.useContext(CompositeListContext);
}
function CompositeList(props) {
  const {
    children,
    elementsRef,
    labelsRef,
    onMapChange: onMapChangeProp
  } = props;
  const onMapChange = useStableCallback(onMapChangeProp);
  const nextIndexRef = reactExports.useRef(0);
  const listeners = useRefWithInit(createListeners).current;
  const map = useRefWithInit(createMap).current;
  const [mapTick, setMapTick] = reactExports.useState(0);
  const lastTickRef = reactExports.useRef(mapTick);
  const register = useStableCallback((node, metadata) => {
    map.set(node, metadata ?? null);
    lastTickRef.current += 1;
    setMapTick(lastTickRef.current);
  });
  const unregister = useStableCallback((node) => {
    map.delete(node);
    lastTickRef.current += 1;
    setMapTick(lastTickRef.current);
  });
  const sortedMap = reactExports.useMemo(() => {
    const newMap = /* @__PURE__ */ new Map();
    const sortedNodes = Array.from(map.keys()).filter((node) => node.isConnected).sort(sortByDocumentPosition);
    sortedNodes.forEach((node, index) => {
      const metadata = map.get(node) ?? {};
      newMap.set(node, {
        ...metadata,
        index
      });
    });
    return newMap;
  }, [map, mapTick]);
  useIsoLayoutEffect(() => {
    if (typeof MutationObserver !== "function" || sortedMap.size === 0) {
      return void 0;
    }
    const mutationObserver = new MutationObserver((entries) => {
      const diff = /* @__PURE__ */ new Set();
      const updateDiff = (node) => diff.has(node) ? diff.delete(node) : diff.add(node);
      entries.forEach((entry) => {
        entry.removedNodes.forEach(updateDiff);
        entry.addedNodes.forEach(updateDiff);
      });
      if (diff.size === 0) {
        lastTickRef.current += 1;
        setMapTick(lastTickRef.current);
      }
    });
    sortedMap.forEach((_, node) => {
      if (node.parentElement) {
        mutationObserver.observe(node.parentElement, {
          childList: true
        });
      }
    });
    return () => {
      mutationObserver.disconnect();
    };
  }, [sortedMap]);
  useIsoLayoutEffect(() => {
    const shouldUpdateLengths = lastTickRef.current === mapTick;
    if (shouldUpdateLengths) {
      if (elementsRef.current.length !== sortedMap.size) {
        elementsRef.current.length = sortedMap.size;
      }
      if (labelsRef && labelsRef.current.length !== sortedMap.size) {
        labelsRef.current.length = sortedMap.size;
      }
      nextIndexRef.current = sortedMap.size;
    }
    onMapChange(sortedMap);
  }, [onMapChange, sortedMap, elementsRef, labelsRef, mapTick]);
  useIsoLayoutEffect(() => {
    return () => {
      elementsRef.current = [];
    };
  }, [elementsRef]);
  useIsoLayoutEffect(() => {
    return () => {
      if (labelsRef) {
        labelsRef.current = [];
      }
    };
  }, [labelsRef]);
  const subscribeMapChange = useStableCallback((fn) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  });
  useIsoLayoutEffect(() => {
    listeners.forEach((l) => l(sortedMap));
  }, [listeners, sortedMap]);
  const contextValue = reactExports.useMemo(() => ({
    register,
    unregister,
    subscribeMapChange,
    elementsRef,
    labelsRef,
    nextIndexRef
  }), [register, unregister, subscribeMapChange, elementsRef, labelsRef, nextIndexRef]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(CompositeListContext.Provider, {
    value: contextValue,
    children
  });
}
function createMap() {
  return /* @__PURE__ */ new Map();
}
function createListeners() {
  return /* @__PURE__ */ new Set();
}
function sortByDocumentPosition(a, b) {
  const position = a.compareDocumentPosition(b);
  if (position & Node.DOCUMENT_POSITION_FOLLOWING || position & Node.DOCUMENT_POSITION_CONTAINED_BY) {
    return -1;
  }
  if (position & Node.DOCUMENT_POSITION_PRECEDING || position & Node.DOCUMENT_POSITION_CONTAINS) {
    return 1;
  }
  return 0;
}
const SelectPositionerContext = /* @__PURE__ */ reactExports.createContext(void 0);
function useSelectPositionerContext() {
  const context = reactExports.useContext(SelectPositionerContext);
  if (!context) {
    throw new Error(formatErrorMessage(59));
  }
  return context;
}
function clearStyles(element, originalStyles) {
  if (element) {
    Object.assign(element.style, originalStyles);
  }
}
const LIST_FUNCTIONAL_STYLES = {
  position: "relative",
  maxHeight: "100%",
  overflowX: "hidden",
  overflowY: "auto"
};
const FIXED = {
  position: "fixed"
};
const SelectPositioner = /* @__PURE__ */ reactExports.forwardRef(function SelectPositioner2(componentProps, forwardedRef) {
  const {
    anchor,
    positionMethod = "absolute",
    className,
    render,
    side = "bottom",
    align = "center",
    sideOffset = 0,
    alignOffset = 0,
    collisionBoundary = "clipping-ancestors",
    collisionPadding,
    arrowPadding = 5,
    sticky = false,
    disableAnchorTracking,
    alignItemWithTrigger = true,
    collisionAvoidance = DROPDOWN_COLLISION_AVOIDANCE,
    ...elementProps
  } = componentProps;
  const {
    store,
    listRef,
    labelsRef,
    alignItemWithTriggerActiveRef,
    selectedItemTextRef,
    valuesRef,
    initialValueRef,
    popupRef,
    setValue
  } = useSelectRootContext();
  const floatingRootContext = useSelectFloatingContext();
  const open = useStore(store, selectors.open);
  const mounted = useStore(store, selectors.mounted);
  const modal = useStore(store, selectors.modal);
  const value = useStore(store, selectors.value);
  const openMethod = useStore(store, selectors.openMethod);
  const positionerElement = useStore(store, selectors.positionerElement);
  const triggerElement = useStore(store, selectors.triggerElement);
  const isItemEqualToValue = useStore(store, selectors.isItemEqualToValue);
  const scrollUpArrowRef = reactExports.useRef(null);
  const scrollDownArrowRef = reactExports.useRef(null);
  const [controlledAlignItemWithTrigger, setControlledAlignItemWithTrigger] = reactExports.useState(alignItemWithTrigger);
  const alignItemWithTriggerActive = mounted && controlledAlignItemWithTrigger && openMethod !== "touch";
  if (!mounted && controlledAlignItemWithTrigger !== alignItemWithTrigger) {
    setControlledAlignItemWithTrigger(alignItemWithTrigger);
  }
  useIsoLayoutEffect(() => {
    if (!mounted) {
      if (selectors.scrollUpArrowVisible(store.state)) {
        store.set("scrollUpArrowVisible", false);
      }
      if (selectors.scrollDownArrowVisible(store.state)) {
        store.set("scrollDownArrowVisible", false);
      }
    }
  }, [store, mounted]);
  reactExports.useImperativeHandle(alignItemWithTriggerActiveRef, () => alignItemWithTriggerActive);
  useScrollLock((alignItemWithTriggerActive || modal) && open && openMethod !== "touch", triggerElement);
  const positioning = useAnchorPositioning({
    anchor,
    floatingRootContext,
    positionMethod,
    mounted,
    side,
    sideOffset,
    align,
    alignOffset,
    arrowPadding,
    collisionBoundary,
    collisionPadding,
    sticky,
    disableAnchorTracking: disableAnchorTracking ?? alignItemWithTriggerActive,
    collisionAvoidance,
    keepMounted: true
  });
  const renderedSide = alignItemWithTriggerActive ? "none" : positioning.side;
  const positionerStyles = alignItemWithTriggerActive ? FIXED : positioning.positionerStyles;
  const defaultProps = reactExports.useMemo(() => {
    const hiddenStyles = {};
    if (!open) {
      hiddenStyles.pointerEvents = "none";
    }
    return {
      role: "presentation",
      hidden: !mounted,
      style: {
        ...positionerStyles,
        ...hiddenStyles
      }
    };
  }, [open, mounted, positionerStyles]);
  const state = reactExports.useMemo(() => ({
    open,
    side: renderedSide,
    align: positioning.align,
    anchorHidden: positioning.anchorHidden
  }), [open, renderedSide, positioning.align, positioning.anchorHidden]);
  const setPositionerElement = useStableCallback((element2) => {
    store.set("positionerElement", element2);
  });
  const element = useRenderElement("div", componentProps, {
    ref: [forwardedRef, setPositionerElement],
    state,
    stateAttributesMapping: popupStateMapping,
    props: [defaultProps, elementProps]
  });
  const prevMapSizeRef = reactExports.useRef(0);
  const onMapChange = useStableCallback((map) => {
    if (map.size === 0 && prevMapSizeRef.current === 0) {
      return;
    }
    if (valuesRef.current.length === 0) {
      return;
    }
    const prevSize = prevMapSizeRef.current;
    prevMapSizeRef.current = map.size;
    if (map.size === prevSize) {
      return;
    }
    const eventDetails = createChangeEventDetails(none);
    if (prevSize !== 0 && !store.state.multiple && value !== null) {
      const valueIndex = findItemIndex(valuesRef.current, value, isItemEqualToValue);
      if (valueIndex === -1) {
        const initial = initialValueRef.current;
        const hasInitial = initial != null && itemIncludes(valuesRef.current, initial, isItemEqualToValue);
        const nextValue = hasInitial ? initial : null;
        setValue(nextValue, eventDetails);
        if (nextValue === null) {
          store.set("selectedIndex", null);
          selectedItemTextRef.current = null;
        }
      }
    }
    if (prevSize !== 0 && store.state.multiple && Array.isArray(value)) {
      const nextValue = value.filter((v) => itemIncludes(valuesRef.current, v, isItemEqualToValue));
      if (nextValue.length !== value.length || nextValue.some((v) => !itemIncludes(value, v, isItemEqualToValue))) {
        setValue(nextValue, eventDetails);
        if (nextValue.length === 0) {
          store.set("selectedIndex", null);
          selectedItemTextRef.current = null;
        }
      }
    }
    if (open && alignItemWithTriggerActive) {
      store.update({
        scrollUpArrowVisible: false,
        scrollDownArrowVisible: false
      });
      const stylesToClear = {
        height: ""
      };
      clearStyles(positionerElement, stylesToClear);
      clearStyles(popupRef.current, stylesToClear);
    }
  });
  const contextValue = reactExports.useMemo(() => ({
    ...positioning,
    side: renderedSide,
    alignItemWithTriggerActive,
    setControlledAlignItemWithTrigger,
    scrollUpArrowRef,
    scrollDownArrowRef
  }), [positioning, renderedSide, alignItemWithTriggerActive, setControlledAlignItemWithTrigger]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(CompositeList, {
    elementsRef: listRef,
    labelsRef,
    onMapChange,
    children: /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectPositionerContext.Provider, {
      value: contextValue,
      children: [mounted && modal && /* @__PURE__ */ jsxRuntimeExports.jsx(InternalBackdrop, {
        inert: inertValue(!open),
        cutout: triggerElement
      }), element]
    })
  });
});
const DISABLE_SCROLLBAR_CLASS_NAME = "base-ui-disable-scrollbar";
const styleDisableScrollbar = {
  className: DISABLE_SCROLLBAR_CLASS_NAME,
  getElement(nonce) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("style", {
      nonce,
      href: DISABLE_SCROLLBAR_CLASS_NAME,
      precedence: "base-ui:low",
      children: `.${DISABLE_SCROLLBAR_CLASS_NAME}{scrollbar-width:none}.${DISABLE_SCROLLBAR_CLASS_NAME}::-webkit-scrollbar{display:none}`
    });
  }
};
function clamp(val, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  return Math.max(min, Math.min(val, max));
}
const CSPContext = /* @__PURE__ */ reactExports.createContext(void 0);
const DEFAULT_CSP_CONTEXT_VALUE = {
  disableStyleElements: false
};
function useCSPContext() {
  return reactExports.useContext(CSPContext) ?? DEFAULT_CSP_CONTEXT_VALUE;
}
const stateAttributesMapping = {
  ...popupStateMapping,
  ...transitionStatusMapping
};
const SelectPopup = /* @__PURE__ */ reactExports.forwardRef(function SelectPopup2(componentProps, forwardedRef) {
  const {
    render,
    className,
    ...elementProps
  } = componentProps;
  const {
    store,
    popupRef,
    onOpenChangeComplete,
    setOpen,
    valueRef,
    selectedItemTextRef,
    keyboardActiveRef,
    multiple,
    handleScrollArrowVisibility,
    scrollHandlerRef,
    highlightItemOnHover
  } = useSelectRootContext();
  const {
    side,
    align,
    alignItemWithTriggerActive,
    setControlledAlignItemWithTrigger,
    scrollDownArrowRef,
    scrollUpArrowRef
  } = useSelectPositionerContext();
  const insideToolbar = useToolbarRootContext() != null;
  const floatingRootContext = useSelectFloatingContext();
  const {
    nonce,
    disableStyleElements
  } = useCSPContext();
  const highlightTimeout = useTimeout();
  const id = useStore(store, selectors.id);
  const open = useStore(store, selectors.open);
  const mounted = useStore(store, selectors.mounted);
  const popupProps = useStore(store, selectors.popupProps);
  const transitionStatus = useStore(store, selectors.transitionStatus);
  const triggerElement = useStore(store, selectors.triggerElement);
  const positionerElement = useStore(store, selectors.positionerElement);
  const listElement = useStore(store, selectors.listElement);
  const initialHeightRef = reactExports.useRef(0);
  const reachedMaxHeightRef = reactExports.useRef(false);
  const maxHeightRef = reactExports.useRef(0);
  const initialPlacedRef = reactExports.useRef(false);
  const originalPositionerStylesRef = reactExports.useRef({});
  const scrollArrowFrame = useAnimationFrame();
  const handleScroll = useStableCallback((scroller) => {
    if (!positionerElement || !popupRef.current || !initialPlacedRef.current) {
      return;
    }
    if (reachedMaxHeightRef.current || !alignItemWithTriggerActive) {
      handleScrollArrowVisibility();
      return;
    }
    const isTopPositioned = positionerElement.style.top === "0px";
    const isBottomPositioned = positionerElement.style.bottom === "0px";
    const currentHeight = positionerElement.getBoundingClientRect().height;
    const doc = ownerDocument(positionerElement);
    const positionerStyles = getComputedStyle(positionerElement);
    const marginTop = parseFloat(positionerStyles.marginTop);
    const marginBottom = parseFloat(positionerStyles.marginBottom);
    const maxPopupHeight = getMaxPopupHeight(getComputedStyle(popupRef.current));
    const viewportHeight = doc.documentElement.clientHeight - marginTop - marginBottom;
    const scrollTop = scroller.scrollTop;
    const scrollHeight = scroller.scrollHeight;
    const clientHeight = scroller.clientHeight;
    const maxScrollTop = scrollHeight - clientHeight;
    let nextPositionerHeight = 0;
    let nextScrollTop = null;
    let setReachedMax = false;
    if (isTopPositioned) {
      const diff = maxScrollTop - scrollTop;
      const idealHeight = currentHeight + diff;
      const nextHeight = Math.min(idealHeight, viewportHeight);
      nextPositionerHeight = nextHeight;
      if (nextHeight !== viewportHeight) {
        nextScrollTop = maxScrollTop;
      } else {
        setReachedMax = true;
      }
    } else if (isBottomPositioned) {
      const diff = scrollTop - 0;
      const idealHeight = currentHeight + diff;
      const nextHeight = Math.min(idealHeight, viewportHeight);
      const overshoot = idealHeight - viewportHeight;
      nextPositionerHeight = nextHeight;
      if (nextHeight !== viewportHeight) {
        nextScrollTop = 0;
      } else {
        setReachedMax = true;
        if (scrollTop < maxScrollTop) {
          nextScrollTop = scrollTop - (diff - overshoot);
        }
      }
    }
    if (nextPositionerHeight !== 0) {
      positionerElement.style.height = `${nextPositionerHeight}px`;
    }
    if (nextScrollTop != null) {
      scroller.scrollTop = nextScrollTop;
    }
    if (setReachedMax || nextPositionerHeight >= maxPopupHeight) {
      reachedMaxHeightRef.current = true;
    }
    handleScrollArrowVisibility();
  });
  reactExports.useImperativeHandle(scrollHandlerRef, () => handleScroll, [handleScroll]);
  useOpenChangeComplete({
    open,
    ref: popupRef,
    onComplete() {
      if (open) {
        onOpenChangeComplete?.(true);
      }
    }
  });
  const state = reactExports.useMemo(() => ({
    open,
    transitionStatus,
    side,
    align
  }), [open, transitionStatus, side, align]);
  useIsoLayoutEffect(() => {
    if (!positionerElement || !popupRef.current || Object.keys(originalPositionerStylesRef.current).length) {
      return;
    }
    originalPositionerStylesRef.current = {
      top: positionerElement.style.top || "0",
      left: positionerElement.style.left || "0",
      right: positionerElement.style.right,
      height: positionerElement.style.height,
      bottom: positionerElement.style.bottom,
      minHeight: positionerElement.style.minHeight,
      maxHeight: positionerElement.style.maxHeight,
      marginTop: positionerElement.style.marginTop,
      marginBottom: positionerElement.style.marginBottom
    };
  }, [popupRef, positionerElement]);
  useIsoLayoutEffect(() => {
    if (open || alignItemWithTriggerActive) {
      return;
    }
    initialPlacedRef.current = false;
    reachedMaxHeightRef.current = false;
    initialHeightRef.current = 0;
    maxHeightRef.current = 0;
    clearStyles(positionerElement, originalPositionerStylesRef.current);
  }, [open, alignItemWithTriggerActive, positionerElement, popupRef]);
  useIsoLayoutEffect(() => {
    const popupElement = popupRef.current;
    if (!open || !triggerElement || !positionerElement || !popupElement || store.state.transitionStatus === "ending") {
      return;
    }
    if (!alignItemWithTriggerActive) {
      initialPlacedRef.current = true;
      scrollArrowFrame.request(handleScrollArrowVisibility);
      popupElement.style.removeProperty("--transform-origin");
      return;
    }
    queueMicrotask(() => {
      const restoreTransformStyles = unsetTransformStyles(popupElement);
      popupElement.style.removeProperty("--transform-origin");
      try {
        const positionerStyles = getComputedStyle(positionerElement);
        const popupStyles = getComputedStyle(popupElement);
        const doc = ownerDocument(triggerElement);
        const win = getWindow(positionerElement);
        const triggerRect = triggerElement.getBoundingClientRect();
        const positionerRect = positionerElement.getBoundingClientRect();
        const triggerX = triggerRect.left;
        const triggerHeight = triggerRect.height;
        const scroller = listElement || popupElement;
        const scrollHeight = scroller.scrollHeight;
        const borderBottom = parseFloat(popupStyles.borderBottomWidth);
        const marginTop = parseFloat(positionerStyles.marginTop) || 10;
        const marginBottom = parseFloat(positionerStyles.marginBottom) || 10;
        const minHeight = parseFloat(positionerStyles.minHeight) || 100;
        const maxPopupHeight = getMaxPopupHeight(popupStyles);
        const paddingLeft = 5;
        const paddingRight = 5;
        const triggerCollisionThreshold = 20;
        const viewportHeight = doc.documentElement.clientHeight - marginTop - marginBottom;
        const viewportWidth = doc.documentElement.clientWidth;
        const availableSpaceBeneathTrigger = viewportHeight - triggerRect.bottom + triggerHeight;
        const textElement = selectedItemTextRef.current;
        const valueElement = valueRef.current;
        let textRect;
        let offsetX = 0;
        let offsetY = 0;
        if (textElement && valueElement) {
          const valueRect = valueElement.getBoundingClientRect();
          textRect = textElement.getBoundingClientRect();
          const valueLeftFromTriggerLeft = valueRect.left - triggerX;
          const textLeftFromPositionerLeft = textRect.left - positionerRect.left;
          const valueCenterFromPositionerTop = valueRect.top - triggerRect.top + valueRect.height / 2;
          const textCenterFromTriggerTop = textRect.top - positionerRect.top + textRect.height / 2;
          offsetX = valueLeftFromTriggerLeft - textLeftFromPositionerLeft;
          offsetY = textCenterFromTriggerTop - valueCenterFromPositionerTop;
        }
        const idealHeight = availableSpaceBeneathTrigger + offsetY + marginBottom + borderBottom;
        let height = Math.min(viewportHeight, idealHeight);
        const maxHeight = viewportHeight - marginTop - marginBottom;
        const scrollTop = idealHeight - height;
        const left = Math.max(paddingLeft, triggerX + offsetX);
        const maxRight = viewportWidth - paddingRight;
        const rightOverflow = Math.max(0, left + positionerRect.width - maxRight);
        positionerElement.style.left = `${left - rightOverflow}px`;
        positionerElement.style.height = `${height}px`;
        positionerElement.style.maxHeight = "auto";
        positionerElement.style.marginTop = `${marginTop}px`;
        positionerElement.style.marginBottom = `${marginBottom}px`;
        popupElement.style.height = "100%";
        const maxScrollTop = scroller.scrollHeight - scroller.clientHeight;
        const isTopPositioned = scrollTop >= maxScrollTop;
        if (isTopPositioned) {
          height = Math.min(viewportHeight, positionerRect.height) - (scrollTop - maxScrollTop);
        }
        const fallbackToAlignPopupToTrigger = triggerRect.top < triggerCollisionThreshold || triggerRect.bottom > viewportHeight - triggerCollisionThreshold || height < Math.min(scrollHeight, minHeight);
        const isPinchZoomed = (win.visualViewport?.scale ?? 1) !== 1 && isWebKit$1;
        if (fallbackToAlignPopupToTrigger || isPinchZoomed) {
          initialPlacedRef.current = true;
          clearStyles(positionerElement, originalPositionerStylesRef.current);
          reactDomExports.flushSync(() => setControlledAlignItemWithTrigger(false));
          return;
        }
        if (isTopPositioned) {
          const topOffset = Math.max(0, viewportHeight - idealHeight);
          positionerElement.style.top = positionerRect.height >= maxHeight ? "0" : `${topOffset}px`;
          positionerElement.style.height = `${height}px`;
          scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight;
          initialHeightRef.current = Math.max(minHeight, height);
        } else {
          positionerElement.style.bottom = "0";
          initialHeightRef.current = Math.max(minHeight, height);
          scroller.scrollTop = scrollTop;
        }
        if (textRect) {
          const popupTop = positionerRect.top;
          const popupHeight = positionerRect.height;
          const textCenterY = textRect.top + textRect.height / 2;
          const transformOriginY = popupHeight > 0 ? (textCenterY - popupTop) / popupHeight * 100 : 50;
          const clampedY = clamp(transformOriginY, 0, 100);
          popupElement.style.setProperty("--transform-origin", `50% ${clampedY}%`);
        }
        if (initialHeightRef.current === viewportHeight || height >= maxPopupHeight) {
          reachedMaxHeightRef.current = true;
        }
        handleScrollArrowVisibility();
        setTimeout(() => {
          initialPlacedRef.current = true;
        });
      } finally {
        restoreTransformStyles();
      }
    });
  }, [store, open, positionerElement, triggerElement, valueRef, selectedItemTextRef, popupRef, handleScrollArrowVisibility, alignItemWithTriggerActive, setControlledAlignItemWithTrigger, scrollArrowFrame, scrollDownArrowRef, scrollUpArrowRef, listElement]);
  reactExports.useEffect(() => {
    if (!alignItemWithTriggerActive || !positionerElement || !open) {
      return void 0;
    }
    const win = getWindow(positionerElement);
    function handleResize(event) {
      setOpen(false, createChangeEventDetails(windowResize, event));
    }
    win.addEventListener("resize", handleResize);
    return () => {
      win.removeEventListener("resize", handleResize);
    };
  }, [setOpen, alignItemWithTriggerActive, positionerElement, open]);
  const defaultProps = {
    ...listElement ? {
      role: "presentation",
      "aria-orientation": void 0
    } : {
      role: "listbox",
      "aria-multiselectable": multiple || void 0,
      id: `${id}-list`
    },
    onKeyDown(event) {
      keyboardActiveRef.current = true;
      if (insideToolbar && COMPOSITE_KEYS.has(event.key)) {
        event.stopPropagation();
      }
    },
    onMouseMove() {
      keyboardActiveRef.current = false;
    },
    onPointerLeave(event) {
      if (!highlightItemOnHover || isMouseWithinBounds(event) || event.pointerType === "touch") {
        return;
      }
      const popup = event.currentTarget;
      highlightTimeout.start(0, () => {
        store.set("activeIndex", null);
        popup.focus({
          preventScroll: true
        });
      });
    },
    onScroll(event) {
      if (listElement) {
        return;
      }
      scrollHandlerRef.current?.(event.currentTarget);
    },
    ...alignItemWithTriggerActive && {
      style: listElement ? {
        height: "100%"
      } : LIST_FUNCTIONAL_STYLES
    }
  };
  const element = useRenderElement("div", componentProps, {
    ref: [forwardedRef, popupRef],
    state,
    stateAttributesMapping,
    props: [popupProps, defaultProps, getDisabledMountTransitionStyles(transitionStatus), {
      className: !listElement && alignItemWithTriggerActive ? styleDisableScrollbar.className : void 0
    }, elementProps]
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(reactExports.Fragment, {
    children: [!disableStyleElements && styleDisableScrollbar.getElement(nonce), /* @__PURE__ */ jsxRuntimeExports.jsx(FloatingFocusManager, {
      context: floatingRootContext,
      modal: false,
      disabled: !mounted,
      restoreFocus: true,
      children: element
    })]
  });
});
function getMaxPopupHeight(popupStyles) {
  const maxHeightStyle = popupStyles.maxHeight || "";
  return maxHeightStyle.endsWith("px") ? parseFloat(maxHeightStyle) || Infinity : Infinity;
}
const UNSET_TRANSFORM_STYLES = {
  transform: "none",
  scale: "1",
  translate: "0 0"
};
function restoreInlineStyleProperty(style, property, value) {
  if (value) {
    style.setProperty(property, value);
  } else {
    style.removeProperty(property);
  }
}
function unsetTransformStyles(popupElement) {
  const {
    style
  } = popupElement;
  const originalStyles = {};
  const props = Object.keys(UNSET_TRANSFORM_STYLES);
  for (const prop of props) {
    originalStyles[prop] = style.getPropertyValue(prop);
    style.setProperty(prop, UNSET_TRANSFORM_STYLES[prop]);
  }
  return () => {
    for (const prop of props) {
      restoreInlineStyleProperty(style, prop, originalStyles[prop]);
    }
  };
}
const SelectList = /* @__PURE__ */ reactExports.forwardRef(function SelectList2(componentProps, forwardedRef) {
  const {
    className,
    render,
    ...elementProps
  } = componentProps;
  const {
    store,
    scrollHandlerRef
  } = useSelectRootContext();
  const {
    alignItemWithTriggerActive
  } = useSelectPositionerContext();
  const hasScrollArrows = useStore(store, selectors.hasScrollArrows);
  const openMethod = useStore(store, selectors.openMethod);
  const multiple = useStore(store, selectors.multiple);
  const id = useStore(store, selectors.id);
  const defaultProps = {
    id: `${id}-list`,
    role: "listbox",
    "aria-multiselectable": multiple || void 0,
    onScroll(event) {
      scrollHandlerRef.current?.(event.currentTarget);
    },
    ...alignItemWithTriggerActive && {
      style: LIST_FUNCTIONAL_STYLES
    },
    className: hasScrollArrows && openMethod !== "touch" ? styleDisableScrollbar.className : void 0
  };
  const setListElement = useStableCallback((element) => {
    store.set("listElement", element);
  });
  return useRenderElement("div", componentProps, {
    ref: [forwardedRef, setListElement],
    props: [defaultProps, elementProps]
  });
});
let IndexGuessBehavior = /* @__PURE__ */ (function(IndexGuessBehavior2) {
  IndexGuessBehavior2[IndexGuessBehavior2["None"] = 0] = "None";
  IndexGuessBehavior2[IndexGuessBehavior2["GuessFromOrder"] = 1] = "GuessFromOrder";
  return IndexGuessBehavior2;
})({});
function useCompositeListItem(params = {}) {
  const {
    label,
    metadata,
    textRef,
    indexGuessBehavior,
    index: externalIndex
  } = params;
  const {
    register,
    unregister,
    subscribeMapChange,
    elementsRef,
    labelsRef,
    nextIndexRef
  } = useCompositeListContext();
  const indexRef = reactExports.useRef(-1);
  const [index, setIndex] = reactExports.useState(externalIndex ?? (indexGuessBehavior === IndexGuessBehavior.GuessFromOrder ? () => {
    if (indexRef.current === -1) {
      const newIndex = nextIndexRef.current;
      nextIndexRef.current += 1;
      indexRef.current = newIndex;
    }
    return indexRef.current;
  } : -1));
  const componentRef = reactExports.useRef(null);
  const ref = reactExports.useCallback((node) => {
    componentRef.current = node;
    if (index !== -1 && node !== null) {
      elementsRef.current[index] = node;
      if (labelsRef) {
        const isLabelDefined = label !== void 0;
        labelsRef.current[index] = isLabelDefined ? label : textRef?.current?.textContent ?? node.textContent;
      }
    }
  }, [index, elementsRef, labelsRef, label, textRef]);
  useIsoLayoutEffect(() => {
    if (externalIndex != null) {
      return void 0;
    }
    const node = componentRef.current;
    if (node) {
      register(node, metadata);
      return () => {
        unregister(node);
      };
    }
    return void 0;
  }, [externalIndex, register, unregister, metadata]);
  useIsoLayoutEffect(() => {
    if (externalIndex != null) {
      return void 0;
    }
    return subscribeMapChange((map) => {
      const i = componentRef.current ? map.get(componentRef.current)?.index : null;
      if (i != null) {
        setIndex(i);
      }
    });
  }, [externalIndex, subscribeMapChange, setIndex]);
  return reactExports.useMemo(() => ({
    ref,
    index
  }), [index, ref]);
}
const SelectItemContext = /* @__PURE__ */ reactExports.createContext(void 0);
function useSelectItemContext() {
  const context = reactExports.useContext(SelectItemContext);
  if (!context) {
    throw new Error(formatErrorMessage(57));
  }
  return context;
}
const SelectItem = /* @__PURE__ */ reactExports.memo(/* @__PURE__ */ reactExports.forwardRef(function SelectItem2(componentProps, forwardedRef) {
  const {
    render,
    className,
    value = null,
    label,
    disabled = false,
    nativeButton = false,
    ...elementProps
  } = componentProps;
  const textRef = reactExports.useRef(null);
  const listItem = useCompositeListItem({
    label,
    textRef,
    indexGuessBehavior: IndexGuessBehavior.GuessFromOrder
  });
  const {
    store,
    getItemProps,
    setOpen,
    setValue,
    selectionRef,
    typingRef,
    valuesRef,
    keyboardActiveRef,
    multiple,
    highlightItemOnHover
  } = useSelectRootContext();
  const highlightTimeout = useTimeout();
  const highlighted = useStore(store, selectors.isActive, listItem.index);
  const selected = useStore(store, selectors.isSelected, listItem.index, value);
  const selectedByFocus = useStore(store, selectors.isSelectedByFocus, listItem.index);
  const isItemEqualToValue = useStore(store, selectors.isItemEqualToValue);
  const index = listItem.index;
  const hasRegistered = index !== -1;
  const itemRef = reactExports.useRef(null);
  const indexRef = useValueAsRef(index);
  useIsoLayoutEffect(() => {
    if (!hasRegistered) {
      return void 0;
    }
    const values = valuesRef.current;
    values[index] = value;
    return () => {
      delete values[index];
    };
  }, [hasRegistered, index, value, valuesRef]);
  useIsoLayoutEffect(() => {
    if (!hasRegistered) {
      return void 0;
    }
    const selectedValue = store.state.value;
    let candidate = selectedValue;
    if (multiple && Array.isArray(selectedValue) && selectedValue.length > 0) {
      candidate = selectedValue[selectedValue.length - 1];
    }
    if (candidate !== void 0 && compareItemEquality(candidate, value, isItemEqualToValue)) {
      store.set("selectedIndex", index);
    }
    return void 0;
  }, [hasRegistered, index, multiple, isItemEqualToValue, store, value]);
  const state = reactExports.useMemo(() => ({
    disabled,
    selected,
    highlighted
  }), [disabled, selected, highlighted]);
  const rootProps = getItemProps({
    active: highlighted,
    selected
  });
  rootProps.onFocus = void 0;
  rootProps.id = void 0;
  const lastKeyRef = reactExports.useRef(null);
  const pointerTypeRef = reactExports.useRef("mouse");
  const didPointerDownRef = reactExports.useRef(false);
  const {
    getButtonProps,
    buttonRef
  } = useButton({
    disabled,
    focusableWhenDisabled: true,
    native: nativeButton
  });
  function commitSelection(event) {
    const selectedValue = store.state.value;
    if (multiple) {
      const currentValue = Array.isArray(selectedValue) ? selectedValue : [];
      const nextValue = selected ? removeItem(currentValue, value, isItemEqualToValue) : [...currentValue, value];
      setValue(nextValue, createChangeEventDetails(itemPress, event));
    } else {
      setValue(value, createChangeEventDetails(itemPress, event));
      setOpen(false, createChangeEventDetails(itemPress, event));
    }
  }
  const defaultProps = {
    role: "option",
    "aria-selected": selected,
    tabIndex: highlighted ? 0 : -1,
    onFocus() {
      store.set("activeIndex", index);
    },
    onMouseEnter() {
      if (!keyboardActiveRef.current && store.state.selectedIndex === null) {
        store.set("activeIndex", index);
      }
    },
    onMouseMove() {
      if (highlightItemOnHover) {
        store.set("activeIndex", index);
      }
    },
    onMouseLeave(event) {
      if (!highlightItemOnHover || keyboardActiveRef.current || isMouseWithinBounds(event)) {
        return;
      }
      highlightTimeout.start(0, () => {
        if (store.state.activeIndex === index) {
          store.set("activeIndex", null);
        }
      });
    },
    onTouchStart() {
      selectionRef.current = {
        allowSelectedMouseUp: false,
        allowUnselectedMouseUp: false
      };
    },
    onKeyDown(event) {
      lastKeyRef.current = event.key;
      store.set("activeIndex", index);
    },
    onClick(event) {
      didPointerDownRef.current = false;
      if (event.type === "keydown" && lastKeyRef.current === null) {
        return;
      }
      if (disabled || lastKeyRef.current === " " && typingRef.current || pointerTypeRef.current !== "touch" && !highlighted) {
        return;
      }
      lastKeyRef.current = null;
      commitSelection(event.nativeEvent);
    },
    onPointerEnter(event) {
      pointerTypeRef.current = event.pointerType;
    },
    onPointerDown(event) {
      pointerTypeRef.current = event.pointerType;
      didPointerDownRef.current = true;
    },
    onMouseUp(event) {
      if (disabled) {
        return;
      }
      if (didPointerDownRef.current) {
        didPointerDownRef.current = false;
        return;
      }
      const disallowSelectedMouseUp = !selectionRef.current.allowSelectedMouseUp && selected;
      const disallowUnselectedMouseUp = !selectionRef.current.allowUnselectedMouseUp && !selected;
      if (disallowSelectedMouseUp || disallowUnselectedMouseUp || pointerTypeRef.current !== "touch" && !highlighted) {
        return;
      }
      commitSelection(event.nativeEvent);
    }
  };
  const element = useRenderElement("div", componentProps, {
    ref: [buttonRef, forwardedRef, listItem.ref, itemRef],
    state,
    props: [rootProps, defaultProps, elementProps, getButtonProps]
  });
  const contextValue = reactExports.useMemo(() => ({
    selected,
    indexRef,
    textRef,
    selectedByFocus,
    hasRegistered
  }), [selected, indexRef, textRef, selectedByFocus, hasRegistered]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItemContext.Provider, {
    value: contextValue,
    children: element
  });
}));
const SelectItemIndicator = /* @__PURE__ */ reactExports.forwardRef(function SelectItemIndicator2(componentProps, forwardedRef) {
  const keepMounted = componentProps.keepMounted ?? false;
  const {
    selected
  } = useSelectItemContext();
  const shouldRender = keepMounted || selected;
  if (!shouldRender) {
    return null;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Inner, {
    ...componentProps,
    ref: forwardedRef
  });
});
const Inner = /* @__PURE__ */ reactExports.memo(/* @__PURE__ */ reactExports.forwardRef((componentProps, forwardedRef) => {
  const {
    render,
    className,
    keepMounted,
    ...elementProps
  } = componentProps;
  const {
    selected
  } = useSelectItemContext();
  const indicatorRef = reactExports.useRef(null);
  const {
    transitionStatus,
    setMounted
  } = useTransitionStatus(selected);
  const state = reactExports.useMemo(() => ({
    selected,
    transitionStatus
  }), [selected, transitionStatus]);
  const element = useRenderElement("span", componentProps, {
    ref: [forwardedRef, indicatorRef],
    state,
    props: [{
      "aria-hidden": true,
      children: "✔️"
    }, elementProps],
    stateAttributesMapping: transitionStatusMapping
  });
  useOpenChangeComplete({
    open: selected,
    ref: indicatorRef,
    onComplete() {
      if (!selected) {
        setMounted(false);
      }
    }
  });
  return element;
}));
const SelectItemText = /* @__PURE__ */ reactExports.memo(/* @__PURE__ */ reactExports.forwardRef(function SelectItemText2(componentProps, forwardedRef) {
  const {
    indexRef,
    textRef,
    selectedByFocus,
    hasRegistered
  } = useSelectItemContext();
  const {
    selectedItemTextRef
  } = useSelectRootContext();
  const {
    className,
    render,
    ...elementProps
  } = componentProps;
  const localRef = reactExports.useCallback((node) => {
    if (!node || !hasRegistered) {
      return;
    }
    const hasNoSelectedItemText = selectedItemTextRef.current === null || !selectedItemTextRef.current.isConnected;
    if (selectedByFocus || hasNoSelectedItemText && indexRef.current === 0) {
      selectedItemTextRef.current = node;
    }
  }, [selectedItemTextRef, indexRef, selectedByFocus, hasRegistered]);
  const element = useRenderElement("div", componentProps, {
    ref: [localRef, forwardedRef, textRef],
    props: elementProps
  });
  return element;
}));
const SelectScrollArrow = /* @__PURE__ */ reactExports.forwardRef(function SelectScrollArrow2(componentProps, forwardedRef) {
  const {
    render,
    className,
    direction,
    keepMounted = false,
    ...elementProps
  } = componentProps;
  const {
    store,
    popupRef,
    listRef,
    handleScrollArrowVisibility,
    scrollArrowsMountedCountRef
  } = useSelectRootContext();
  const {
    side,
    scrollDownArrowRef,
    scrollUpArrowRef
  } = useSelectPositionerContext();
  const visibleSelector = direction === "up" ? selectors.scrollUpArrowVisible : selectors.scrollDownArrowVisible;
  const stateVisible = useStore(store, visibleSelector);
  const openMethod = useStore(store, selectors.openMethod);
  const visible = stateVisible && openMethod !== "touch";
  const timeout = useTimeout();
  const scrollArrowRef = direction === "up" ? scrollUpArrowRef : scrollDownArrowRef;
  const {
    transitionStatus,
    setMounted
  } = useTransitionStatus(visible);
  useIsoLayoutEffect(() => {
    scrollArrowsMountedCountRef.current += 1;
    if (!store.state.hasScrollArrows) {
      store.set("hasScrollArrows", true);
    }
    return () => {
      scrollArrowsMountedCountRef.current = Math.max(0, scrollArrowsMountedCountRef.current - 1);
      if (scrollArrowsMountedCountRef.current === 0 && store.state.hasScrollArrows) {
        store.set("hasScrollArrows", false);
      }
    };
  }, [store, scrollArrowsMountedCountRef]);
  useOpenChangeComplete({
    open: visible,
    ref: scrollArrowRef,
    onComplete() {
      if (!visible) {
        setMounted(false);
      }
    }
  });
  const state = reactExports.useMemo(() => ({
    direction,
    visible,
    side,
    transitionStatus
  }), [direction, visible, side, transitionStatus]);
  const defaultProps = {
    "aria-hidden": true,
    children: direction === "up" ? "▲" : "▼",
    style: {
      position: "absolute"
    },
    onMouseMove(event) {
      if (event.movementX === 0 && event.movementY === 0 || timeout.isStarted()) {
        return;
      }
      store.set("activeIndex", null);
      function scrollNextItem() {
        const scroller = store.state.listElement ?? popupRef.current;
        if (!scroller) {
          return;
        }
        store.set("activeIndex", null);
        handleScrollArrowVisibility();
        const isScrolledToTop = scroller.scrollTop === 0;
        const isScrolledToBottom = Math.round(scroller.scrollTop + scroller.clientHeight) >= scroller.scrollHeight;
        const list = listRef.current;
        if (list.length === 0) {
          if (direction === "up") {
            store.set("scrollUpArrowVisible", !isScrolledToTop);
          } else {
            store.set("scrollDownArrowVisible", !isScrolledToBottom);
          }
        }
        if (direction === "up" && isScrolledToTop || direction === "down" && isScrolledToBottom) {
          timeout.clear();
          return;
        }
        if ((store.state.listElement || popupRef.current) && listRef.current && listRef.current.length > 0) {
          const items = listRef.current;
          const scrollArrowHeight = scrollArrowRef.current?.offsetHeight || 0;
          if (direction === "up") {
            let firstVisibleIndex = 0;
            const scrollTop = scroller.scrollTop + scrollArrowHeight;
            for (let i = 0; i < items.length; i += 1) {
              const item = items[i];
              if (item) {
                const itemTop = item.offsetTop;
                if (itemTop >= scrollTop) {
                  firstVisibleIndex = i;
                  break;
                }
              }
            }
            const targetIndex = Math.max(0, firstVisibleIndex - 1);
            if (targetIndex < firstVisibleIndex) {
              const targetItem = items[targetIndex];
              if (targetItem) {
                scroller.scrollTop = Math.max(0, targetItem.offsetTop - scrollArrowHeight);
              }
            } else {
              scroller.scrollTop = 0;
            }
          } else {
            let lastVisibleIndex = items.length - 1;
            const scrollBottom = scroller.scrollTop + scroller.clientHeight - scrollArrowHeight;
            for (let i = 0; i < items.length; i += 1) {
              const item = items[i];
              if (item) {
                const itemBottom = item.offsetTop + item.offsetHeight;
                if (itemBottom > scrollBottom) {
                  lastVisibleIndex = Math.max(0, i - 1);
                  break;
                }
              }
            }
            const targetIndex = Math.min(items.length - 1, lastVisibleIndex + 1);
            if (targetIndex > lastVisibleIndex) {
              const targetItem = items[targetIndex];
              if (targetItem) {
                scroller.scrollTop = targetItem.offsetTop + targetItem.offsetHeight - scroller.clientHeight + scrollArrowHeight;
              }
            } else {
              scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight;
            }
          }
        }
        timeout.start(40, scrollNextItem);
      }
      timeout.start(40, scrollNextItem);
    },
    onMouseLeave() {
      timeout.clear();
    }
  };
  const element = useRenderElement("div", componentProps, {
    ref: [forwardedRef, scrollArrowRef],
    state,
    props: [defaultProps, elementProps]
  });
  const shouldRender = visible || keepMounted;
  if (!shouldRender) {
    return null;
  }
  return element;
});
const SelectScrollDownArrow = /* @__PURE__ */ reactExports.forwardRef(function SelectScrollDownArrow2(props, forwardedRef) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(SelectScrollArrow, {
    ...props,
    ref: forwardedRef,
    direction: "down"
  });
});
const SelectScrollUpArrow = /* @__PURE__ */ reactExports.forwardRef(function SelectScrollUpArrow2(props, forwardedRef) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(SelectScrollArrow, {
    ...props,
    ref: forwardedRef,
    direction: "up"
  });
});
export {
  AvatarRoot as A,
  DialogBackdrop as B,
  CheckboxRoot as C,
  DialogRoot as D,
  Button as E,
  Input as I,
  PopoverRoot as P,
  SelectRoot as S,
  PopoverTrigger as a,
  PopoverPortal as b,
  PopoverPositioner as c,
  PopoverPopup as d,
  CheckboxIndicator as e,
  SelectTrigger as f,
  SelectIcon as g,
  SelectValue as h,
  SelectPortal as i,
  SelectPositioner as j,
  SelectPopup as k,
  SelectList as l,
  mergeProps$1 as m,
  SelectItem as n,
  SelectItemText as o,
  SelectItemIndicator as p,
  SelectScrollUpArrow as q,
  SelectScrollDownArrow as r,
  AvatarImage as s,
  AvatarFallback as t,
  useRender as u,
  DialogPopup as v,
  DialogClose as w,
  DialogTitle as x,
  DialogDescription as y,
  DialogPortal as z
};

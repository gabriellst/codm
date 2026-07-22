var NOT_FOUND = /* @__PURE__ */ Symbol("NOT_FOUND");
function assertIsFunction(func, errorMessage = `expected a function, instead received ${typeof func}`) {
  if (typeof func !== "function") {
    throw new TypeError(errorMessage);
  }
}
function assertIsObject(object, errorMessage = `expected an object, instead received ${typeof object}`) {
  if (typeof object !== "object") {
    throw new TypeError(errorMessage);
  }
}
function assertIsArrayOfFunctions(array, errorMessage = `expected all items to be functions, instead received the following types: `) {
  if (!array.every((item) => typeof item === "function")) {
    const itemTypes = array.map(
      (item) => typeof item === "function" ? `function ${item.name || "unnamed"}()` : typeof item
    ).join(", ");
    throw new TypeError(`${errorMessage}[${itemTypes}]`);
  }
}
var ensureIsArray = (item) => {
  return Array.isArray(item) ? item : [item];
};
function getDependencies(createSelectorArgs) {
  const dependencies = Array.isArray(createSelectorArgs[0]) ? createSelectorArgs[0] : createSelectorArgs;
  assertIsArrayOfFunctions(
    dependencies,
    `createSelector expects all input-selectors to be functions, but received the following types: `
  );
  return dependencies;
}
function collectInputSelectorResults(dependencies, inputSelectorArgs) {
  const inputSelectorResults = [];
  const { length } = dependencies;
  for (let i = 0; i < length; i++) {
    inputSelectorResults.push(dependencies[i].apply(null, inputSelectorArgs));
  }
  return inputSelectorResults;
}
function createSingletonCache(equals) {
  let entry;
  return {
    get(key) {
      if (entry && equals(entry.key, key)) {
        return entry.value;
      }
      return NOT_FOUND;
    },
    put(key, value) {
      entry = { key, value };
    },
    getEntries() {
      return entry ? [entry] : [];
    },
    clear() {
      entry = void 0;
    }
  };
}
function createLruCache(maxSize, equals) {
  let entries = [];
  function get(key) {
    const cacheIndex = entries.findIndex((entry) => equals(key, entry.key));
    if (cacheIndex > -1) {
      const entry = entries[cacheIndex];
      if (cacheIndex > 0) {
        entries.splice(cacheIndex, 1);
        entries.unshift(entry);
      }
      return entry.value;
    }
    return NOT_FOUND;
  }
  function put(key, value) {
    if (get(key) === NOT_FOUND) {
      entries.unshift({ key, value });
      if (entries.length > maxSize) {
        entries.pop();
      }
    }
  }
  function getEntries() {
    return entries;
  }
  function clear() {
    entries = [];
  }
  return { get, put, getEntries, clear };
}
var referenceEqualityCheck = (a, b) => a === b;
function createCacheKeyComparator(equalityCheck) {
  return function areArgumentsShallowlyEqual(prev, next) {
    if (prev === null || next === null || prev.length !== next.length) {
      return false;
    }
    const { length } = prev;
    for (let i = 0; i < length; i++) {
      if (!equalityCheck(prev[i], next[i])) {
        return false;
      }
    }
    return true;
  };
}
function lruMemoize(func, equalityCheckOrOptions) {
  const providedOptions = typeof equalityCheckOrOptions === "object" ? equalityCheckOrOptions : { equalityCheck: equalityCheckOrOptions };
  const {
    equalityCheck = referenceEqualityCheck,
    maxSize = 1,
    resultEqualityCheck
  } = providedOptions;
  const comparator = createCacheKeyComparator(equalityCheck);
  let resultsCount = 0;
  const cache = maxSize <= 1 ? createSingletonCache(comparator) : createLruCache(maxSize, comparator);
  function memoized() {
    let value = cache.get(arguments);
    if (value === NOT_FOUND) {
      value = func.apply(null, arguments);
      resultsCount++;
      if (resultEqualityCheck) {
        const entries = cache.getEntries();
        const matchingEntry = entries.find(
          (entry) => resultEqualityCheck(entry.value, value)
        );
        if (matchingEntry) {
          value = matchingEntry.value;
          resultsCount !== 0 && resultsCount--;
        }
      }
      cache.put(arguments, value);
    }
    return value;
  }
  memoized.clearCache = () => {
    cache.clear();
    memoized.resetResultsCount();
  };
  memoized.resultsCount = () => resultsCount;
  memoized.resetResultsCount = () => {
    resultsCount = 0;
  };
  return memoized;
}
var StrongRef = class {
  constructor(value) {
    this.value = value;
  }
  deref() {
    return this.value;
  }
};
var Ref = typeof WeakRef !== "undefined" ? WeakRef : StrongRef;
var UNTERMINATED = 0;
var TERMINATED = 1;
function createCacheNode() {
  return {
    s: UNTERMINATED,
    v: void 0,
    o: null,
    p: null
  };
}
function weakMapMemoize(func, options = {}) {
  let fnNode = createCacheNode();
  const { resultEqualityCheck } = options;
  let lastResult;
  let resultsCount = 0;
  function memoized() {
    let cacheNode = fnNode;
    const { length } = arguments;
    for (let i = 0, l = length; i < l; i++) {
      const arg = arguments[i];
      if (typeof arg === "function" || typeof arg === "object" && arg !== null) {
        let objectCache = cacheNode.o;
        if (objectCache === null) {
          cacheNode.o = objectCache = /* @__PURE__ */ new WeakMap();
        }
        const objectNode = objectCache.get(arg);
        if (objectNode === void 0) {
          cacheNode = createCacheNode();
          objectCache.set(arg, cacheNode);
        } else {
          cacheNode = objectNode;
        }
      } else {
        let primitiveCache = cacheNode.p;
        if (primitiveCache === null) {
          cacheNode.p = primitiveCache = /* @__PURE__ */ new Map();
        }
        const primitiveNode = primitiveCache.get(arg);
        if (primitiveNode === void 0) {
          cacheNode = createCacheNode();
          primitiveCache.set(arg, cacheNode);
        } else {
          cacheNode = primitiveNode;
        }
      }
    }
    const terminatedNode = cacheNode;
    let result;
    if (cacheNode.s === TERMINATED) {
      result = cacheNode.v;
    } else {
      result = func.apply(null, arguments);
      resultsCount++;
      if (resultEqualityCheck) {
        const lastResultValue = lastResult?.deref?.() ?? lastResult;
        if (lastResultValue != null && resultEqualityCheck(lastResultValue, result)) {
          result = lastResultValue;
          resultsCount !== 0 && resultsCount--;
        }
        const needsWeakRef = typeof result === "object" && result !== null || typeof result === "function";
        lastResult = needsWeakRef ? new Ref(result) : result;
      }
    }
    terminatedNode.s = TERMINATED;
    terminatedNode.v = result;
    return result;
  }
  memoized.clearCache = () => {
    fnNode = createCacheNode();
    memoized.resetResultsCount();
  };
  memoized.resultsCount = () => resultsCount;
  memoized.resetResultsCount = () => {
    resultsCount = 0;
  };
  return memoized;
}
function createSelectorCreator(memoizeOrOptions, ...memoizeOptionsFromArgs) {
  const createSelectorCreatorOptions = typeof memoizeOrOptions === "function" ? {
    memoize: memoizeOrOptions,
    memoizeOptions: memoizeOptionsFromArgs
  } : memoizeOrOptions;
  const createSelector2 = (...createSelectorArgs) => {
    let recomputations = 0;
    let dependencyRecomputations = 0;
    let lastResult;
    let directlyPassedOptions = {};
    let resultFunc = createSelectorArgs.pop();
    if (typeof resultFunc === "object") {
      directlyPassedOptions = resultFunc;
      resultFunc = createSelectorArgs.pop();
    }
    assertIsFunction(
      resultFunc,
      `createSelector expects an output function after the inputs, but received: [${typeof resultFunc}]`
    );
    const combinedOptions = {
      ...createSelectorCreatorOptions,
      ...directlyPassedOptions
    };
    const {
      memoize,
      memoizeOptions = [],
      argsMemoize = weakMapMemoize,
      argsMemoizeOptions = []
    } = combinedOptions;
    const finalMemoizeOptions = ensureIsArray(memoizeOptions);
    const finalArgsMemoizeOptions = ensureIsArray(argsMemoizeOptions);
    const dependencies = getDependencies(createSelectorArgs);
    const memoizedResultFunc = memoize(function recomputationWrapper() {
      recomputations++;
      return resultFunc.apply(
        null,
        arguments
      );
    }, ...finalMemoizeOptions);
    const selector = argsMemoize(function dependenciesChecker() {
      dependencyRecomputations++;
      const inputSelectorResults = collectInputSelectorResults(
        dependencies,
        arguments
      );
      lastResult = memoizedResultFunc.apply(null, inputSelectorResults);
      return lastResult;
    }, ...finalArgsMemoizeOptions);
    return Object.assign(selector, {
      resultFunc,
      memoizedResultFunc,
      dependencies,
      dependencyRecomputations: () => dependencyRecomputations,
      resetDependencyRecomputations: () => {
        dependencyRecomputations = 0;
      },
      lastResult: () => lastResult,
      recomputations: () => recomputations,
      resetRecomputations: () => {
        recomputations = 0;
      },
      memoize,
      argsMemoize
    });
  };
  Object.assign(createSelector2, {
    withTypes: () => createSelector2
  });
  return createSelector2;
}
var createSelector = /* @__PURE__ */ createSelectorCreator(weakMapMemoize);
var createStructuredSelector = Object.assign(
  (inputSelectorsObject, selectorCreator = createSelector) => {
    assertIsObject(
      inputSelectorsObject,
      `createStructuredSelector expects first argument to be an object where each property is a selector, instead received a ${typeof inputSelectorsObject}`
    );
    const inputSelectorKeys = Object.keys(inputSelectorsObject);
    const dependencies = inputSelectorKeys.map(
      (key) => inputSelectorsObject[key]
    );
    const structuredSelector = selectorCreator(
      dependencies,
      (...inputSelectorResults) => {
        return inputSelectorResults.reduce((composition, value, index) => {
          composition[inputSelectorKeys[index]] = value;
          return composition;
        }, {});
      }
    );
    return structuredSelector;
  },
  { withTypes: () => createStructuredSelector }
);
export {
  createSelectorCreator as c,
  lruMemoize as l
};

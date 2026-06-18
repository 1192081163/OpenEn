type RuntimeMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void
) => boolean | void | Promise<unknown>;

interface RawEventApi {
  addListener(listener: RuntimeMessageListener): void;
  removeListener?(listener: RuntimeMessageListener): void;
}

interface RawStorageArea {
  get(key: string, callback?: (values: Record<string, unknown>) => void): Promise<Record<string, unknown>> | void;
  set(values: Record<string, unknown>, callback?: () => void): Promise<void> | void;
}

interface RawRuntimeApi {
  lastError?: { message?: string };
  sendMessage?(message: unknown, callback?: (response: unknown) => void): Promise<unknown> | void;
  openOptionsPage?(callback?: () => void): Promise<void> | void;
  onMessage?: RawEventApi;
}

interface RawTabsApi {
  query?(queryInfo: Record<string, unknown>, callback?: (tabs: Array<{ id?: number }>) => void): Promise<Array<{ id?: number }>> | void;
  sendMessage?(tabId: number, message: unknown, callback?: (response: unknown) => void): Promise<unknown> | void;
}

interface RawExtensionApi {
  runtime?: RawRuntimeApi;
  storage?: { local?: RawStorageArea };
  tabs?: RawTabsApi;
}

export interface WebExtensionApi {
  runtime: {
    sendMessage(message: unknown): Promise<unknown>;
    openOptionsPage(): Promise<void>;
    onMessage?: RawEventApi;
  };
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>;
      set(values: Record<string, unknown>): Promise<void>;
    };
  };
  tabs?: {
    query(queryInfo: Record<string, unknown>): Promise<Array<{ id?: number }>>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
}

function hasUsableCapability(api: RawExtensionApi | undefined): api is RawExtensionApi {
  return Boolean(
    api?.runtime?.sendMessage ||
      api?.runtime?.openOptionsPage ||
      api?.runtime?.onMessage ||
      api?.storage?.local
  );
}

function getRawApi(): { api: RawExtensionApi; promiseFirst: boolean } | undefined {
  const globals = globalThis as typeof globalThis & {
    browser?: RawExtensionApi;
    chrome?: RawExtensionApi;
  };

  if (hasUsableCapability(globals.browser)) {
    return { api: globals.browser, promiseFirst: true };
  }

  if (hasUsableCapability(globals.chrome)) {
    return { api: globals.chrome, promiseFirst: false };
  }

  return undefined;
}

function runtimeError(api: RawExtensionApi): Error | undefined {
  const message = api.runtime?.lastError?.message;
  return message ? new Error(message) : undefined;
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}

function chromeCallback<T>(api: RawExtensionApi, run: (callback: (value: T) => void) => unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const callback = (value: T): void => {
      const error = runtimeError(api);
      if (error) {
        reject(error);
        return;
      }
      resolve(value);
    };
    const returned = run(callback);
    if (isPromiseLike<T>(returned)) {
      Promise.resolve(returned).then(resolve, reject);
    }
  });
}

export function hasWebExtensionApi(): boolean {
  return getRawApi() !== undefined;
}

export function getWebExtensionApi(): WebExtensionApi {
  const raw = getRawApi();
  if (!raw) throw new Error("WebExtension API unavailable");

  const { api, promiseFirst } = raw;
  const runtime = api.runtime;
  const storage = api.storage?.local;
  if (!runtime) throw new Error("WebExtension API unavailable");
  const runtimeApi: WebExtensionApi["runtime"] = {
    sendMessage(message) {
      if (!runtime.sendMessage) return Promise.reject(new Error("WebExtension runtime messaging unavailable"));
      if (promiseFirst) return Promise.resolve(runtime.sendMessage(message));
      return chromeCallback(api, (callback) => {
        runtime.sendMessage?.(message, callback);
      });
    },
    openOptionsPage() {
      if (!runtime.openOptionsPage) return Promise.resolve();
      if (promiseFirst) return Promise.resolve(runtime.openOptionsPage()).then(() => undefined);
      return chromeCallback<void>(api, (callback) => {
        runtime.openOptionsPage?.(callback);
      });
    }
  };
  if (runtime.onMessage) runtimeApi.onMessage = runtime.onMessage;

  const extensionApi: WebExtensionApi = {
    runtime: runtimeApi,
    storage: {
      local: {
        get(key) {
          if (!storage) return Promise.reject(new Error("WebExtension storage unavailable"));
          if (promiseFirst) return Promise.resolve(storage.get(key) as Promise<Record<string, unknown>> | Record<string, unknown>);
          return chromeCallback(api, (callback) => {
            storage.get(key, callback);
          });
        },
        set(values) {
          if (!storage) return Promise.reject(new Error("WebExtension storage unavailable"));
          if (promiseFirst) return Promise.resolve(storage.set(values));
          return chromeCallback<void>(api, (callback) => {
            storage.set(values, callback);
          });
        }
      }
    }
  };

  if (api.tabs?.query && api.tabs.sendMessage) {
    extensionApi.tabs = {
      query(queryInfo) {
        if (promiseFirst) return Promise.resolve(api.tabs?.query?.(queryInfo) ?? []);
        return chromeCallback(api, (callback) => {
          api.tabs?.query?.(queryInfo, callback);
        });
      },
      sendMessage(tabId, message) {
        if (promiseFirst) return Promise.resolve(api.tabs?.sendMessage?.(tabId, message));
        return chromeCallback(api, (callback) => {
          api.tabs?.sendMessage?.(tabId, message, callback);
        });
      }
    };
  }

  return extensionApi;
}

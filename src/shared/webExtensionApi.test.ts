import { getWebExtensionApi } from "./webExtensionApi";

describe("webExtensionApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses promise-first browser APIs when available", async () => {
    const sendMessage = vi.fn(async (message: unknown) => ({ ok: true, data: message }));
    const openOptionsPage = vi.fn(async () => undefined);
    const storage = {
      get: vi.fn(async () => ({ value: 1 })),
      set: vi.fn(async () => undefined)
    };
    vi.stubGlobal("browser", {
      runtime: { sendMessage, openOptionsPage },
      storage: { local: storage }
    });
    vi.stubGlobal("chrome", {
      runtime: { sendMessage: vi.fn(async () => ({ ok: false })) },
      storage: { local: { get: vi.fn(), set: vi.fn() } }
    });

    const api = getWebExtensionApi();

    await expect(api.runtime.sendMessage({ type: "PING" })).resolves.toEqual({ ok: true, data: { type: "PING" } });
    await expect(api.runtime.openOptionsPage()).resolves.toBeUndefined();
    await expect(api.storage.local.get("value")).resolves.toEqual({ value: 1 });
    expect(sendMessage).toHaveBeenCalledWith({ type: "PING" });
    expect(openOptionsPage).toHaveBeenCalledOnce();
  });

  it("falls back to chrome callback APIs", async () => {
    const sendMessage = vi.fn((message: unknown, callback: (response: unknown) => void) => {
      callback({ ok: true, data: message });
    });
    const openOptionsPage = vi.fn((callback: () => void) => callback());
    const storage = {
      get: vi.fn((key: string, callback: (response: unknown) => void) => callback({ [key]: "stored" })),
      set: vi.fn((_values: Record<string, unknown>, callback: () => void) => callback())
    };
    vi.stubGlobal("chrome", {
      runtime: { sendMessage, openOptionsPage },
      storage: { local: storage }
    });

    const api = getWebExtensionApi();

    await expect(api.runtime.sendMessage({ type: "PING" })).resolves.toEqual({ ok: true, data: { type: "PING" } });
    await expect(api.runtime.openOptionsPage()).resolves.toBeUndefined();
    await expect(api.storage.local.get("value")).resolves.toEqual({ value: "stored" });
    await expect(api.storage.local.set({ value: "next" })).resolves.toBeUndefined();
    expect(sendMessage).toHaveBeenCalledWith({ type: "PING" }, expect.any(Function));
    expect(storage.set).toHaveBeenCalledWith({ value: "next" }, expect.any(Function));
  });

  it("reports unavailable runtime when neither namespace exists", () => {
    expect(() => getWebExtensionApi()).toThrow("WebExtension API unavailable");
  });
});

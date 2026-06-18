import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("extension manifest", () => {
  it("declares the v1 MV3 extension surface", () => {
    const manifestPath = resolve(process.cwd(), "public/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toContain("storage");
    expect(manifest.permissions).toContain("activeTab");
    expect(manifest.host_permissions).toContain("https://api.deepseek.com/*");
    expect(manifest.background.service_worker).toBe("background/serviceWorker.js");
    expect(manifest.content_scripts[0].matches).toEqual(["http://*/*", "https://*/*"]);
    expect(manifest.content_scripts[0].js).toEqual(["content/contentScript.js"]);
    expect(manifest.options_page).toBe("ui/vocabulary/vocabulary.html");
    expect(manifest.action.default_popup).toBe("ui/popup/popup.html");
  });

  it("declares a Safari-ready MV3 extension surface", () => {
    const manifestPath = resolve(process.cwd(), "public/manifest.safari.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));

    expect(packageJson.scripts["build:safari"]).toBe("node scripts/build.mjs --target safari");
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.host_permissions).toEqual(["https://api.deepseek.com/*"]);
    expect(manifest.background.service_worker).toBe("background/serviceWorker.js");
    expect(manifest.background.type).toBeUndefined();
    expect(manifest.content_scripts[0].matches).toEqual(["http://*/*", "https://*/*"]);
    expect(manifest.content_scripts[0].js).toEqual(["content/contentScript.js"]);
    expect(manifest.options_page).toBe("ui/vocabulary/vocabulary.html");
    expect(manifest.action.default_popup).toBe("ui/popup/popup.html");
    expect(manifest.browser_specific_settings.safari.strict_min_version).toBe("17.0");
  });
});

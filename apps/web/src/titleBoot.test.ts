import type { DesktopBridge } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import indexHtml from "../index.html?raw";

const bootstrapMarkup = indexHtml.match(
  /<title>([^<]+)<\/title>(?:\s*<script>([\s\S]*?)<\/script>)?/,
);
if (!bootstrapMarkup?.[1]) throw new Error("Could not find the bootstrap title in index.html");

const initialTitle = bootstrapMarkup[1];
const bootScript = bootstrapMarkup[2] ?? "";

function runTitleBootScript(desktopBridge?: Partial<Pick<DesktopBridge, "getAppBranding">>) {
  const document = { title: initialTitle };
  const window = { desktopBridge };

  new Function("window", "document", bootScript)(window, document);

  return document.title;
}

describe("desktop startup title", () => {
  it.each([
    { stageLabel: "Dev", displayName: "T3 Code (Dev)" },
    { stageLabel: "Nightly", displayName: "T3 Code (Nightly)" },
    { stageLabel: "Alpha", displayName: "T3 Code (Alpha)" },
  ] as const)("uses $displayName before the app bundle loads", ({ stageLabel, displayName }) => {
    expect(
      runTitleBootScript({
        getAppBranding: () => ({ baseName: "T3 Code", stageLabel, displayName }),
      }),
    ).toBe(displayName);
  });

  it("keeps the existing browser title without a desktop bridge", () => {
    expect(runTitleBootScript()).toBe("T3 Code (Alpha)");
  });

  it("keeps the existing title when the bridge has no branding method", () => {
    expect(runTitleBootScript({})).toBe("T3 Code (Alpha)");
  });

  it("keeps the existing title when desktop branding is unavailable", () => {
    expect(runTitleBootScript({ getAppBranding: () => null })).toBe("T3 Code (Alpha)");
  });

  it("does not replace the fallback with an empty display name", () => {
    expect(
      runTitleBootScript({
        getAppBranding: () => ({ baseName: "T3 Code", stageLabel: "Dev", displayName: "" }),
      }),
    ).toBe("T3 Code (Alpha)");
  });
});

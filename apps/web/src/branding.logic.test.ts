import { describe, expect, it } from "vite-plus/test";

import { resolveWebAppStageLabel, resolveWindowTitle } from "./branding.logic";

describe("window titles", () => {
  const appDisplayName = "T3 Code (Beta)";

  it("shows the selected project and thread on desktop", () => {
    expect(
      resolveWindowTitle({
        appDisplayName,
        projectTitle: " acme ",
        threadTitle: " Fix login ",
        desktop: true,
      }),
    ).toBe("acme / Fix login");
  });

  it("keeps app identity in browser tabs", () => {
    expect(
      resolveWindowTitle({
        appDisplayName,
        projectTitle: "acme",
        threadTitle: "Fix login",
        desktop: false,
      }),
    ).toBe("acme / Fix login — T3 Code (Beta)");
  });

  it.each([null, "", "  "])("returns to app branding for a missing thread (%s)", (threadTitle) => {
    expect(
      resolveWindowTitle({ appDisplayName, projectTitle: "acme", threadTitle, desktop: true }),
    ).toBe(appDisplayName);
  });

  it("omits the separator while the project title is unavailable", () => {
    expect(
      resolveWindowTitle({
        appDisplayName,
        projectTitle: null,
        threadTitle: "Fix login",
        desktop: true,
      }),
    ).toBe("Fix login");
  });
});

describe("startup branding", () => {
  it.each([
    { hostedAppChannel: null, development: false, expected: "Beta" },
    { hostedAppChannel: null, development: true, expected: "Dev" },
    { hostedAppChannel: " Nightly ", development: true, expected: "Nightly" },
    { hostedAppChannel: "latest", development: false, expected: "Latest" },
  ])("uses $expected for $hostedAppChannel", ({ expected, ...input }) => {
    expect(resolveWebAppStageLabel(input)).toBe(expected);
  });
});

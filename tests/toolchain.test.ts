import { describe, expect, it } from "vitest";
import { detectSiteToolsMode, environmentMessage } from "../src/environment";

describe("static application shell", () => {
  it("keeps the product usable when Site tools are absent", () => {
    const mode = detectSiteToolsMode({});

    expect(mode).toBe("no-site-tools");
    expect(environmentMessage(mode)).toContain("complete page workflow");
  });

  it("requires a callable registerTool surface", () => {
    expect(detectSiteToolsMode({ modelContext: {} })).toBe("no-site-tools");
    expect(detectSiteToolsMode({ modelContext: { registerTool() {} } })).toBe("site-tools");
  });
});

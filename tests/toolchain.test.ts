import { describe, expect, it } from "vitest";
import { detectSiteToolsMode, environmentMessage } from "../src/environment";

describe("static application shell", () => {
  it("keeps the product usable when Site tools are absent", () => {
    const mode = detectSiteToolsMode({});

    expect(mode).toBe("no-site-tools");
    expect(environmentMessage(mode)).toContain("complete page workflow");
  });

  it("recognizes a real or test ModelContext without installing a shim", () => {
    expect(detectSiteToolsMode({ modelContext: {} })).toBe("site-tools");
  });
});

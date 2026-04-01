import { describe, expect, it } from "vitest";
import { formatAxisValue, normalizeAxisExtent } from "./chartInteraction";

describe("chartInteraction helpers", () => {
  it("normalizes extents to stable precision", () => {
    expect(normalizeAxisExtent([1089.123456, 1702.987654], "x")).toEqual([1089, 1703]);
    expect(normalizeAxisExtent([-0.130125523012553, 0.669874476987447], "y")).toEqual([-0.1301, 0.6699]);
  });

  it("formats axis labels without long floating tails", () => {
    expect(formatAxisValue(1200.45678, "x")).toBe("1,200.46");
    expect(formatAxisValue(0.669874476987447, "y")).toBe("0.6699");
  });
});

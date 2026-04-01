import { describe, expect, it } from "vitest";
import { formatAxisValue, normalizeAxisExtent, shiftZoomWindow } from "./chartInteraction";

describe("chartInteraction helpers", () => {
  it("normalizes extents to stable precision", () => {
    expect(normalizeAxisExtent([1089.123456, 1702.987654], "x")).toEqual([1089, 1703]);
    expect(normalizeAxisExtent([-0.130125523012553, 0.669874476987447], "y")).toEqual([-0.1301, 0.6699]);
  });

  it("formats axis labels without long floating tails", () => {
    expect(formatAxisValue(1200.45678, "x")).toBe("1,200.46");
    expect(formatAxisValue(0.669874476987447, "y")).toBe("0.6699");
  });

  it("shifts zoom windows while preserving width and clamping bounds", () => {
    expect(shiftZoomWindow(20, 60, 10)).toEqual([30, 70]);
    expect(shiftZoomWindow(20, 60, -30)).toEqual([0, 40]);
    expect(shiftZoomWindow(60, 100, 20)).toEqual([60, 100]);
  });
});

import { describe, expect, it } from "vitest";
import { formatAxisValue, getAxisDisplayLabel, getXAxisTitle, normalizeAxisExtent, shiftZoomWindow } from "./chartInteraction";

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

  it("builds axis labels and titles for wavelength and wavenumber spectra", () => {
    expect(getAxisDisplayLabel("wavelength", "nm")).toBe("波长 (nm)");
    expect(getAxisDisplayLabel("wavenumber", "cm^-1")).toBe("波数 (cm^-1)");
    expect(
      getXAxisTitle([
        {
          id: 1,
          file_name: "a.csv",
          source_path_last_seen: "/tmp/a.csv",
          metadata: {},
          axis_kind: "wavenumber",
          axis_unit: "cm^-1",
          point_count: 2,
          x_values: [1, 2],
          y_values: [3, 4],
          labels: [],
          class_key: "A",
          class_display_name: "A",
          component_count: 1,
          is_excluded: false,
          excluded_at: null,
          created_at: null,
          updated_at: null
        }
      ])
    ).toBe("波数 (cm^-1)");
  });
});

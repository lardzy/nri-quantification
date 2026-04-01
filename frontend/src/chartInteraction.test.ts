import { describe, expect, it } from "vitest";
import { findNearestPointIndex, findNearestSpectrumHit } from "./chartInteraction";
import type { SpectrumItem } from "./types";

function makeSpectrum(id: number, fileName: string, yValues: number[]): SpectrumItem {
  return {
    id,
    file_name: fileName,
    source_path_last_seen: `/tmp/${fileName}`,
    metadata: {},
    axis_kind: "wavelength",
    axis_unit: "nm",
    point_count: 3,
    x_values: [900, 901, 902],
    y_values: yValues,
    labels: [{ name: fileName, value: 100 }],
    class_key: fileName,
    class_display_name: fileName,
    component_count: 1,
    is_excluded: false,
    excluded_at: null,
    created_at: null,
    updated_at: null
  };
}

describe("chartInteraction", () => {
  it("returns the closest point index around the target x", () => {
    expect(findNearestPointIndex([900, 901, 902], 900.1)).toBe(0);
    expect(findNearestPointIndex([900, 901, 902], 901.8)).toBe(2);
  });

  it("returns the nearest spectrum when one curve is inside the threshold", () => {
    const spectra = [makeSpectrum(1, "A", [0.1, 0.15, 0.2]), makeSpectrum(2, "B", [0.4, 0.45, 0.5])];
    const hit = findNearestSpectrumHit({
      spectra,
      xValue: 901,
      yValue: 0.16,
      yThreshold: 0.05
    });

    expect(hit?.spectrum.id).toBe(1);
    expect(hit?.pointIndex).toBe(1);
  });

  it("returns null when every spectrum is outside the threshold", () => {
    const spectra = [makeSpectrum(1, "A", [0.1, 0.15, 0.2]), makeSpectrum(2, "B", [0.4, 0.45, 0.5])];
    const hit = findNearestSpectrumHit({
      spectra,
      xValue: 901,
      yValue: 1.2,
      yThreshold: 0.05
    });

    expect(hit).toBeNull();
  });
});

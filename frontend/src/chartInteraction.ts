import type { SpectrumItem } from "./types";

export type SpectrumHit = {
  spectrum: SpectrumItem;
  pointIndex: number;
  distance: number;
  xValue: number;
  yValue: number;
};

export type Extent = [number, number];

export function formatSpectrumLabels(labels: SpectrumItem["labels"]): string {
  return labels.map((item) => `${item.name} ${Number(item.value.toFixed(4))}%`).join(" / ");
}

export function findNearestPointIndex(values: number[], target: number): number {
  if (values.length === 0) {
    return -1;
  }
  let left = 0;
  let right = values.length - 1;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (values[middle] < target) {
      left = middle + 1;
    } else {
      right = middle;
    }
  }

  if (left === 0) {
    return 0;
  }
  const previous = left - 1;
  return Math.abs(values[left] - target) < Math.abs(values[previous] - target) ? left : previous;
}

export function findNearestSpectrumHit(params: {
  spectra: SpectrumItem[];
  xValue: number;
  yValue: number;
  yThreshold: number;
}): SpectrumHit | null {
  const { spectra, xValue, yValue, yThreshold } = params;
  if (!Number.isFinite(xValue) || !Number.isFinite(yValue) || !Number.isFinite(yThreshold) || yThreshold <= 0) {
    return null;
  }

  let bestHit: SpectrumHit | null = null;
  for (const spectrum of spectra) {
    if (spectrum.x_values.length === 0 || spectrum.x_values.length !== spectrum.y_values.length) {
      continue;
    }

    const pointIndex = findNearestPointIndex(spectrum.x_values, xValue);
    if (pointIndex < 0) {
      continue;
    }

    const pointY = spectrum.y_values[pointIndex];
    const distance = Math.abs(pointY - yValue);
    if (distance > yThreshold) {
      continue;
    }

    if (bestHit === null || distance < bestHit.distance) {
      bestHit = {
        spectrum,
        pointIndex,
        distance,
        xValue: spectrum.x_values[pointIndex],
        yValue: pointY
      };
    }
  }

  return bestHit;
}

export function getAxisFractionDigits(span: number, axis: "x" | "y"): number {
  const safeSpan = Number.isFinite(span) && span > 0 ? span : 1;
  if (axis === "x") {
    if (safeSpan >= 100) {
      return 0;
    }
    if (safeSpan >= 10) {
      return 1;
    }
    return 2;
  }

  if (safeSpan >= 1) {
    return 3;
  }
  if (safeSpan >= 0.1) {
    return 4;
  }
  return 5;
}

export function normalizeAxisExtent(extent: [number, number], axis: "x" | "y"): [number, number] {
  const span = Math.abs(extent[1] - extent[0]);
  const digits = getAxisFractionDigits(span, axis);
  return [Number(extent[0].toFixed(digits)), Number(extent[1].toFixed(digits))];
}

export function formatAxisValue(value: number, axis: "x" | "y"): string {
  const digits = axis === "x" ? 2 : 4;
  const formatter = new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
  return formatter.format(Number(value.toFixed(digits)));
}

export function getSpectraExtents(spectra: SpectrumItem[]): { xExtent: Extent; yExtent: Extent } {
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;

  for (const spectrum of spectra) {
    for (const xValue of spectrum.x_values) {
      if (Number.isFinite(xValue)) {
        xMin = Math.min(xMin, xValue);
        xMax = Math.max(xMax, xValue);
      }
    }
    for (const yValue of spectrum.y_values) {
      if (Number.isFinite(yValue)) {
        yMin = Math.min(yMin, yValue);
        yMax = Math.max(yMax, yValue);
      }
    }
  }

  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMin === xMax) {
    xMin = 0;
    xMax = 1;
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin === yMax) {
    yMin = 0;
    yMax = 1;
  }

  return { xExtent: [xMin, xMax], yExtent: [yMin, yMax] };
}

export function shiftZoomWindow(start: number, end: number, deltaPercent: number): Extent {
  const width = Math.max(0, Math.min(100, end) - Math.max(0, start));
  if (!Number.isFinite(deltaPercent) || width >= 100) {
    return [Math.max(0, start), Math.min(100, end)];
  }

  const minStart = 0;
  const maxStart = 100 - width;
  const nextStart = Math.min(maxStart, Math.max(minStart, start + deltaPercent));
  return [nextStart, nextStart + width];
}

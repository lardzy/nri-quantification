import type { SpectrumItem } from "./types";

export type SpectrumHit = {
  spectrum: SpectrumItem;
  pointIndex: number;
  distance: number;
  xValue: number;
  yValue: number;
};

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

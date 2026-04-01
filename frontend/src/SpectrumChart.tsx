import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { EChartsType } from "echarts";
import { Tag } from "antd";
import { findNearestSpectrumHit, formatSpectrumLabels } from "./chartInteraction";
import type { SpectrumItem } from "./types";

type HoverPreview = {
  spectrum: SpectrumItem;
  left: number;
  top: number;
};

type Props = {
  spectra: SpectrumItem[];
  hoveredSpectrumId: number | null;
  lockedSpectrumId: number | null;
  onHoverSpectrum: (spectrum: SpectrumItem | null) => void;
  onLockSpectrum: (spectrum: SpectrumItem | null) => void;
  onExclude: (spectrum: SpectrumItem) => void;
};

export function SpectrumChart({
  spectra,
  hoveredSpectrumId,
  lockedSpectrumId,
  onHoverSpectrum,
  onLockSpectrum,
  onExclude
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const hitRef = useRef<SpectrumItem | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const latestPointerRef = useRef<{ x: number; y: number } | null>(null);
  const spectraRef = useRef<SpectrumItem[]>(spectra);
  const hoverCallbackRef = useRef(onHoverSpectrum);
  const lockCallbackRef = useRef(onLockSpectrum);
  const excludeCallbackRef = useRef(onExclude);
  const [preview, setPreview] = useState<HoverPreview | null>(null);

  useEffect(() => {
    spectraRef.current = spectra;
  }, [spectra]);

  useEffect(() => {
    hoverCallbackRef.current = onHoverSpectrum;
  }, [onHoverSpectrum]);

  useEffect(() => {
    lockCallbackRef.current = onLockSpectrum;
  }, [onLockSpectrum]);

  useEffect(() => {
    excludeCallbackRef.current = onExclude;
  }, [onExclude]);

  const activeSpectrumId = hoveredSpectrumId ?? lockedSpectrumId;

  const option = useMemo(() => {
    return {
      animation: false,
      backgroundColor: "#fcfcfd",
      tooltip: { show: false },
      grid: { left: 52, right: 24, top: 24, bottom: 48 },
      xAxis: {
        type: "value",
        name: spectra[0]?.axis_unit === "nm" ? "波长 (nm)" : "X",
        scale: true,
        axisLabel: { color: "#475467" },
        splitLine: { lineStyle: { color: "rgba(15, 23, 42, 0.08)" } }
      },
      yAxis: {
        type: "value",
        name: "吸光度",
        scale: true,
        axisLabel: { color: "#475467" },
        splitLine: { lineStyle: { color: "rgba(15, 23, 42, 0.08)" } }
      },
      dataZoom: [
        { type: "inside", xAxisIndex: 0 },
        { type: "inside", yAxisIndex: 0 },
        {
          type: "slider",
          xAxisIndex: 0,
          bottom: 8,
          height: 18,
          borderColor: "rgba(15, 23, 42, 0.08)"
        }
      ],
      series: spectra.map((spectrum, index) => {
        const isActive = activeSpectrumId === spectrum.id;
        return {
          type: "line",
          name: spectrum.file_name,
          showSymbol: false,
          sampling: "lttb",
          silent: true,
          lineStyle: {
            width: isActive ? 2.6 : 1.1,
            opacity: isActive ? 0.98 : spectrum.is_excluded ? 0.14 : 0.26
          },
          z: isActive ? 10 : 2,
          data: spectrum.x_values.map((xValue, pointIndex) => [xValue, spectrum.y_values[pointIndex]]),
          color: palette[index % palette.length]
        };
      })
    };
  }, [activeSpectrumId, spectra]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const chart = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(containerRef.current);

    const clearHover = () => {
      hitRef.current = null;
      setPreview(null);
      hoverCallbackRef.current(null);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };

    const resolveHitAtPointer = (pointer: { x: number; y: number } | null) => {
      const chartInstance = chartRef.current;
      if (!chartInstance || !pointer) {
        return null;
      }
      if (!chartInstance.containPixel({ gridIndex: 0 }, [pointer.x, pointer.y])) {
        return null;
      }

      const dataPoint = chartInstance.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [pointer.x, pointer.y]) as number[] | undefined;
      const thresholdPoint = chartInstance.convertFromPixel(
        { xAxisIndex: 0, yAxisIndex: 0 },
        [pointer.x, pointer.y + 16]
      ) as number[] | undefined;
      if (!Array.isArray(dataPoint) || dataPoint.length < 2) {
        return null;
      }

      const yThreshold = Math.max(Math.abs((thresholdPoint?.[1] ?? dataPoint[1]) - dataPoint[1]), 0.0025);
      return findNearestSpectrumHit({
        spectra: spectraRef.current,
        xValue: dataPoint[0],
        yValue: dataPoint[1],
        yThreshold
      });
    };

    const updateHover = () => {
      animationFrameRef.current = null;
      const pointer = latestPointerRef.current;
      const hit = resolveHitAtPointer(pointer);
      if (!pointer || !hit) {
        clearHover();
        return;
      }

      hitRef.current = hit.spectrum;
      hoverCallbackRef.current(hit.spectrum);
      setPreview({
        spectrum: hit.spectrum,
        left: pointer.x + 16,
        top: pointer.y + 16
      });
    };

    const scheduleHover = (x: number, y: number) => {
      latestPointerRef.current = { x, y };
      if (animationFrameRef.current !== null) {
        return;
      }
      animationFrameRef.current = requestAnimationFrame(updateHover);
    };

    chart.getZr().on("mousemove", (event) => {
      scheduleHover(event.offsetX, event.offsetY);
    });
    chart.getZr().on("globalout", clearHover);
    chart.getZr().on("click", (event) => {
      const hit = resolveHitAtPointer({ x: event.offsetX, y: event.offsetY });
      if (!hit) {
        return;
      }
      hitRef.current = hit.spectrum;
      lockCallbackRef.current(hit.spectrum);
      excludeCallbackRef.current(hit.spectrum);
    });

    return () => {
      clearHover();
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setOption(option, true);
    }
  }, [option]);

  return (
    <div className="chart-shell">
      <div className="chart-surface" ref={containerRef} />
      {preview && (
        <div
          className="chart-hover-card"
          style={{
            left: `${Math.min(preview.left, Math.max(24, (containerRef.current?.clientWidth ?? 0) - 260))}px`,
            top: `${preview.top}px`
          }}
          role="tooltip"
        >
          <div className="chart-hover-title">{preview.spectrum.file_name}</div>
          <div className="chart-hover-subtitle">{formatSpectrumLabels(preview.spectrum.labels) || "无标签"}</div>
          <div className="chart-hover-tags">
            <Tag color={preview.spectrum.is_excluded ? "default" : "processing"}>
              {preview.spectrum.is_excluded ? "已剔除" : "有效"}
            </Tag>
            <Tag>{preview.spectrum.class_display_name}</Tag>
          </div>
        </div>
      )}
    </div>
  );
}

const palette = [
  "#155eef",
  "#087443",
  "#dd6b20",
  "#7a5af8",
  "#0086c9",
  "#be123c",
  "#364152",
  "#0e9384",
  "#ef4444",
  "#b54708"
];

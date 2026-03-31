import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsType } from "echarts";
import type { SpectrumItem } from "./types";

type Props = {
  spectra: SpectrumItem[];
  onExclude: (spectrum: SpectrumItem) => void;
};

export function SpectrumChart({ spectra, onExclude }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const onExcludeRef = useRef(onExclude);

  useEffect(() => {
    onExcludeRef.current = onExclude;
  }, [onExclude]);

  const option = useMemo(() => {
    return {
      animation: false,
      backgroundColor: "#fffdf7",
      tooltip: {
        trigger: "item",
        confine: true,
        formatter: (params: any) => {
          const spectrum = params.data.spectrum as SpectrumItem;
          const labels = spectrum.labels.map((item) => `${item.name}:${item.value}`).join(" / ");
          return [
            `<strong>${spectrum.file_name}</strong>`,
            `分类: ${spectrum.class_display_name}`,
            `标签: ${labels || "无"}`,
            `状态: ${spectrum.is_excluded ? "已剔除" : "有效"}`,
            `路径: ${spectrum.source_path_last_seen}`
          ].join("<br/>");
        }
      },
      grid: { left: 48, right: 24, top: 24, bottom: 48 },
      xAxis: {
        type: "value",
        name: spectra[0]?.axis_unit === "nm" ? "波长 (nm)" : "X",
        scale: true
      },
      yAxis: {
        type: "value",
        name: "吸光度",
        scale: true
      },
      dataZoom: [
        { type: "inside", xAxisIndex: 0 },
        { type: "inside", yAxisIndex: 0 },
        { type: "slider", xAxisIndex: 0, bottom: 8 }
      ],
      series: spectra.map((spectrum, index) => ({
        type: "line",
        name: spectrum.file_name,
        showSymbol: false,
        sampling: "lttb",
        lineStyle: {
          width: 1,
          opacity: spectrum.is_excluded ? 0.15 : 0.35
        },
        emphasis: {
          focus: "series",
          lineStyle: { width: 2, opacity: 0.95 }
        },
        data: spectrum.x_values.map((xValue, pointIndex) => ({
          value: [xValue, spectrum.y_values[pointIndex]],
          spectrum
        })),
        color: palette[index % palette.length]
      }))
    };
  }, [spectra]);

  useEffect(() => {
    if (!containerRef.current) return;
    chartRef.current = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
    const chart = chartRef.current;
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(containerRef.current);
    chart.on("click", (params: any) => {
      const spectrum = params.data?.spectrum as SpectrumItem | undefined;
      if (spectrum) onExcludeRef.current(spectrum);
    });
    return () => {
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

  return <div className="chart-surface" ref={containerRef} />;
}

const palette = [
  "#124559",
  "#598392",
  "#ff7f51",
  "#7f5539",
  "#2a9d8f",
  "#8d99ae",
  "#d62828",
  "#e9c46a",
  "#5c677d",
  "#3a86ff"
];

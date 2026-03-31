import { useEffect, useMemo, useState } from "react";
import { api, subscribeJob } from "./api";
import { SpectrumChart } from "./SpectrumChart";
import type { FsEntry, JobItem, SpectrumClass, SpectrumItem, SubsetSummary } from "./types";
import "./styles.css";

type PathChooserProps = {
  kind: "import" | "export";
  currentPath: string | null;
  onSelect: (path: string) => void;
};

function PathChooser({ kind, currentPath, onSelect }: PathChooserProps) {
  const [roots, setRoots] = useState<string[]>([]);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);

  useEffect(() => {
    api.getRoots().then((data) => {
      const nextRoots = kind === "import" ? data.import_roots : data.export_roots;
      setRoots(nextRoots);
      if (!currentPath && nextRoots[0]) {
        onSelect(nextRoots[0]);
      }
    });
  }, [currentPath, kind, onSelect]);

  useEffect(() => {
    if (!currentPath) return;
    api.browse(kind, currentPath).then((data) => {
      setEntries(data.entries.filter((entry) => entry.is_dir));
      setParentPath(data.parent_path ?? null);
    });
  }, [currentPath, kind]);

  return (
    <div className="path-chooser">
      <select value={roots.includes(currentPath ?? "") ? currentPath ?? "" : ""} onChange={(event) => onSelect(event.target.value)}>
        <option value="" disabled>
          选择根目录
        </option>
        {roots.map((root) => (
          <option key={root} value={root}>
            {root}
          </option>
        ))}
      </select>
      {currentPath && (
        <div className="path-current">
          <code>{currentPath}</code>
        </div>
      )}
      <div className="path-children">
        {parentPath && (
          <button className="ghost-button" onClick={() => onSelect(parentPath)}>
            返回上一级
          </button>
        )}
        {entries.map((entry) => (
          <button key={entry.path} className="ghost-button" onClick={() => onSelect(entry.path)}>
            {entry.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [classes, setClasses] = useState<SpectrumClass[]>([]);
  const [classSort, setClassSort] = useState<"count" | "component_count" | "name">("count");
  const [selectedClass, setSelectedClass] = useState<SpectrumClass | null>(null);
  const [spectra, setSpectra] = useState<SpectrumItem[]>([]);
  const [excludedFilter, setExcludedFilter] = useState<"active" | "excluded" | "all">("active");
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [recentExcluded, setRecentExcluded] = useState<SpectrumItem[]>([]);
  const [importPath, setImportPath] = useState<string | null>(null);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [lastExcluded, setLastExcluded] = useState<SpectrumItem | null>(null);
  const [subsetMode, setSubsetMode] = useState<"count" | "ratio">("count");
  const [subsetInput, setSubsetInput] = useState<string>("4");
  const [subsets, setSubsets] = useState<SubsetSummary[]>([]);
  const [activeSubsetId, setActiveSubsetId] = useState<string | undefined>();
  const [loadingSpectra, setLoadingSpectra] = useState(false);
  const [spectraTotal, setSpectraTotal] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [exportSelectedOnly, setExportSelectedOnly] = useState<boolean>(true);

  const canRender = spectraTotal <= 2000;

  useEffect(() => {
    api.getClasses(classSort).then(setClasses).catch((error) => setErrorText(String(error)));
  }, [classSort]);

  useEffect(() => {
    api.recentExcluded().then(setRecentExcluded).catch(() => undefined);
    api.listJobs().then(setJobs).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedClass) {
      setSpectra([]);
      setSpectraTotal(0);
      return;
    }
    setLoadingSpectra(true);
    api
      .getSpectra({
        classKey: selectedClass.class_key,
        excluded: excludedFilter,
        subsetId: activeSubsetId,
        limit: 2000
      })
      .then((data) => {
        setSpectra(data.items);
        setSpectraTotal(data.count);
        setLoadingSpectra(false);
      })
      .catch((error) => {
        setLoadingSpectra(false);
        setErrorText(String(error));
      });
  }, [selectedClass, excludedFilter, activeSubsetId]);

  const labelsPreview = useMemo(() => selectedClass?.class_display_name ?? "未选择分类", [selectedClass]);

  async function refreshClasses() {
    const next = await api.getClasses(classSort);
    setClasses(next);
    if (selectedClass) {
      const replacement = next.find((item) => item.class_key === selectedClass.class_key) ?? null;
      setSelectedClass(replacement);
    }
  }

  async function refreshExcluded() {
    const items = await api.recentExcluded();
    setRecentExcluded(items);
  }

  function trackJob(job: JobItem) {
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)].slice(0, 20));
    return subscribeJob(job.id, (next) => {
      setJobs((current) => [next, ...current.filter((item) => item.id !== next.id)].slice(0, 20));
      if (next.status === "completed" && next.type === "import") {
        refreshClasses().catch(() => undefined);
        refreshExcluded().catch(() => undefined);
      }
    });
  }

  async function startImport() {
    if (!importPath) return;
    const job = await api.createImportJob(importPath);
    trackJob(job);
  }

  async function startExport(scope: "active" | "excluded" | "all") {
    if (!exportPath) return;
    const classKeys = exportSelectedOnly && selectedClass ? [selectedClass.class_key] : [];
    const job = await api.createExportJob(exportPath, scope, classKeys);
    trackJob(job);
  }

  async function handleExclude(spectrum: SpectrumItem) {
    if (spectrum.is_excluded) return;
    const updated = await api.excludeSpectrum(spectrum.id);
    setLastExcluded(updated);
    setSpectra((current) =>
      current
        .map((item) => (item.id === updated.id ? updated : item))
        .filter((item) => (excludedFilter === "active" ? !item.is_excluded : true))
    );
    setSpectraTotal((current) => Math.max(0, excludedFilter === "active" ? current - 1 : current));
    await refreshClasses();
    await refreshExcluded();
  }

  async function handleUndo() {
    if (!lastExcluded) return;
    await api.restoreSpectrum(lastExcluded.id);
    setLastExcluded(null);
    await refreshClasses();
    await refreshExcluded();
    if (selectedClass) {
      const data = await api.getSpectra({
        classKey: selectedClass.class_key,
        excluded: excludedFilter,
        subsetId: activeSubsetId,
        limit: 2000
      });
      setSpectra(data.items);
      setSpectraTotal(data.count);
    }
  }

  async function createSubsets() {
    if (!selectedClass) return;
    const payload =
      subsetMode === "count"
        ? { mode: "count" as const, parts: Number(subsetInput) || 1 }
        : {
            mode: "ratio" as const,
            ratios: subsetInput
              .split(",")
              .map((item) => Number(item.trim()))
              .filter((item) => Number.isFinite(item) && item > 0)
          };
    const result = await api.createSubsets(selectedClass.class_key, payload);
    setSubsets(result.subsets);
    setActiveSubsetId(undefined);
  }

  return (
    <div className="app-shell">
      <aside className="panel left-panel">
        <section>
          <h2>导入</h2>
          <PathChooser kind="import" currentPath={importPath} onSelect={setImportPath} />
          <button className="primary-button" onClick={() => startImport().catch((error) => setErrorText(String(error)))}>
            开始导入
          </button>
        </section>

        <section>
          <div className="section-title">
            <h2>分类</h2>
            <select value={classSort} onChange={(event) => setClassSort(event.target.value as typeof classSort)}>
              <option value="count">按数量</option>
              <option value="component_count">按组分数</option>
              <option value="name">按名称</option>
            </select>
          </div>
          <div className="scroll-area class-list">
            {classes.map((item) => (
              <button
                key={item.class_key}
                className={`class-card ${selectedClass?.class_key === item.class_key ? "selected" : ""}`}
                onClick={() => {
                  setSelectedClass(item);
                  setSubsets([]);
                  setActiveSubsetId(undefined);
                }}
              >
                <div className="class-name">{item.class_display_name}</div>
                <div className="class-meta">
                  <span>{item.component_count}组分</span>
                  <span>总数 {item.total_count}</span>
                  <span>有效 {item.active_count}</span>
                  <span>剔除 {item.excluded_count}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <main className="panel center-panel">
        <div className="toolbar">
          <div>
            <h1>光谱预览</h1>
            <p>{labelsPreview}</p>
          </div>
          <div className="toolbar-actions">
            <select value={excludedFilter} onChange={(event) => setExcludedFilter(event.target.value as typeof excludedFilter)}>
              <option value="active">仅有效</option>
              <option value="excluded">仅剔除</option>
              <option value="all">全部</option>
            </select>
            <button className="ghost-button" onClick={() => handleUndo().catch((error) => setErrorText(String(error)))} disabled={!lastExcluded}>
              撤销最近剔除
            </button>
          </div>
        </div>

        <div className="subset-bar">
          <label>
            子集模式
            <select value={subsetMode} onChange={(event) => setSubsetMode(event.target.value as typeof subsetMode)}>
              <option value="count">按数量切分</option>
              <option value="ratio">按比例切分</option>
            </select>
          </label>
          <input
            value={subsetInput}
            onChange={(event) => setSubsetInput(event.target.value)}
            placeholder={subsetMode === "count" ? "例如 4" : "例如 1,1,1,1"}
          />
          <button className="ghost-button" onClick={() => createSubsets().catch((error) => setErrorText(String(error)))} disabled={!selectedClass}>
            生成子集
          </button>
          {subsets.length > 0 && (
            <div className="subset-tabs">
              <button className={`ghost-button ${!activeSubsetId ? "active-tab" : ""}`} onClick={() => setActiveSubsetId(undefined)}>
                全部
              </button>
              {subsets.map((subset) => (
                <button
                  key={subset.subset_id}
                  className={`ghost-button ${activeSubsetId === subset.subset_id ? "active-tab" : ""}`}
                  onClick={() => setActiveSubsetId(subset.subset_id)}
                >
                  子集{subset.index} ({subset.count})
                </button>
              ))}
            </div>
          )}
        </div>

        {!canRender && (
          <div className="warning-box">
            当前结果共有 {spectraTotal} 条，超过 2000 条上限，请先切分子集或缩小过滤条件后再绘制。
          </div>
        )}
        {loadingSpectra ? <div className="chart-placeholder">正在读取光谱…</div> : canRender ? <SpectrumChart spectra={spectra} onExclude={handleExclude} /> : null}
      </main>

      <aside className="panel right-panel">
        <section>
          <h2>导出</h2>
          <PathChooser kind="export" currentPath={exportPath} onSelect={setExportPath} />
          <label className="checkbox-row">
            <input type="checkbox" checked={exportSelectedOnly} onChange={(event) => setExportSelectedOnly(event.target.checked)} />
            仅导出当前选中分类
          </label>
          <div className="action-row">
            <button className="primary-button" onClick={() => startExport("active").catch((error) => setErrorText(String(error)))}>
              导出未剔除
            </button>
            <button className="ghost-button" onClick={() => startExport("excluded").catch((error) => setErrorText(String(error)))}>
              导出剔除
            </button>
            <button className="ghost-button" onClick={() => startExport("all").catch((error) => setErrorText(String(error)))}>
              导出全部
            </button>
          </div>
        </section>

        <section>
          <h2>作业</h2>
          <div className="scroll-area jobs-list">
            {jobs.map((job) => {
              const progress = job.total_discovered > 0 ? Math.round((job.processed_count / job.total_discovered) * 100) : 0;
              return (
                <div key={job.id} className="job-card">
                  <div className="job-head">
                    <strong>{job.type === "import" ? "导入" : "导出"} #{job.id}</strong>
                    <span>{job.status}</span>
                  </div>
                  <progress max={100} value={progress}></progress>
                  <div className="job-meta">{job.progress_message}</div>
                  <div className="job-meta">
                    发现 {job.total_discovered} / 已处理 {job.processed_count} / 成功 {job.imported_count} / 跳过 {job.skipped_count} / 失败 {job.failed_count}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2>已剔除</h2>
          <div className="scroll-area excluded-list">
            {recentExcluded.map((item) => (
              <div key={item.id} className="excluded-card">
                <div>{item.file_name}</div>
                <div className="muted">{item.class_display_name}</div>
                <button className="ghost-button" onClick={() => api.restoreSpectrum(item.id).then(() => Promise.all([refreshExcluded(), refreshClasses()])).catch((error) => setErrorText(String(error)))}>
                  恢复
                </button>
              </div>
            ))}
          </div>
        </section>

        {errorText && <div className="error-box">{errorText}</div>}
      </aside>
    </div>
  );
}

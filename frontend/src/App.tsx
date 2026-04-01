import {
  App as AntdApp,
  Alert,
  Badge,
  Button,
  Card,
  ConfigProvider,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Grid,
  Input,
  InputNumber,
  Layout,
  List,
  Progress,
  Segmented,
  Select,
  Space,
  Spin,
  Statistic,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
  notification
} from "antd";
import {
  BarChartOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  UndoOutlined
} from "@ant-design/icons";
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, subscribeJob } from "./api";
import { formatSpectrumLabels } from "./chartInteraction";
import { SpectrumChart } from "./SpectrumChart";
import type { FsEntry, JobItem, SpectrumClass, SpectrumItem, SubsetSummary } from "./types";
import "./styles.css";

const { Content, Header, Sider } = Layout;
const { Paragraph, Text, Title } = Typography;

type PathChooserProps = {
  kind: "import" | "export";
  currentPath: string | null;
  onSelect: (path: string) => void;
  title: string;
  actionLabel: string;
  actionIcon: ReactNode;
  actionDisabled?: boolean;
  onAction: () => Promise<void>;
};

type ChartInteractionState = {
  hoveredSpectrum: SpectrumItem | null;
  lockedSpectrum: SpectrumItem | null;
};

type ExportScope = "active" | "excluded" | "all";

const EXPORT_SCOPE_LABELS: Record<ExportScope, string> = {
  active: "未剔除",
  excluded: "已剔除",
  all: "全部"
};

function PathChooserCard({
  kind,
  currentPath,
  onSelect,
  title,
  actionLabel,
  actionIcon,
  actionDisabled = false,
  onAction
}: PathChooserProps) {
  const [roots, setRoots] = useState<string[]>([]);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getRoots()
      .then((data) => {
        const nextRoots = kind === "import" ? data.import_roots : data.export_roots;
        setRoots(nextRoots);
        if (!currentPath && nextRoots[0]) {
          onSelect(nextRoots[0]);
        }
      })
      .catch((error) => setBrowseError(String(error)));
  }, [currentPath, kind, onSelect]);

  useEffect(() => {
    if (!currentPath) {
      setEntries([]);
      setParentPath(null);
      return;
    }
    setLoading(true);
    api
      .browse(kind, currentPath)
      .then((data) => {
        setEntries(data.entries.filter((entry) => entry.is_dir));
        setParentPath(data.parent_path ?? null);
        setBrowseError(null);
        setLoading(false);
      })
      .catch((error) => {
        setLoading(false);
        setBrowseError(String(error));
      });
  }, [currentPath, kind]);

  const selectedRoot = useMemo(() => {
    if (!currentPath) {
      return undefined;
    }
    return roots.find((root) => currentPath.startsWith(root)) ?? roots[0];
  }, [currentPath, roots]);

  return (
    <Card
      size="small"
      title={title}
      extra={
        <Button type="primary" icon={actionIcon} disabled={actionDisabled || !currentPath} onClick={() => void onAction()}>
          {actionLabel}
        </Button>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Select
          value={selectedRoot}
          placeholder="选择根目录"
          options={roots.map((root) => ({ value: root, label: root }))}
          onChange={(value) => onSelect(value)}
        />
        <div className="path-current-card">
          <Text type="secondary">当前路径</Text>
          <Paragraph className="path-current-text" ellipsis={{ rows: 2, expandable: true, symbol: "展开" }}>
            {currentPath ?? "未选择目录"}
          </Paragraph>
        </div>
        {browseError && <Alert type="error" showIcon message="目录读取失败" description={browseError} />}
        <div className="path-actions">
          {parentPath && (
            <Button icon={<UndoOutlined />} onClick={() => onSelect(parentPath)}>
              返回上一级
            </Button>
          )}
          {entries.map((entry) => (
            <Button key={entry.path} icon={<FolderOpenOutlined />} onClick={() => onSelect(entry.path)}>
              {entry.name}
            </Button>
          ))}
          {!loading && entries.length === 0 && <Text type="secondary">当前目录下没有可进入的子目录</Text>}
        </div>
        {loading && <Spin size="small" />}
      </Space>
    </Card>
  );
}

function DetailCard(props: {
  spectrum: SpectrumItem | null;
  modeLabel: string | null;
  compact?: boolean;
  onExclude: (spectrum: SpectrumItem) => Promise<void>;
  onRestore: (spectrum: SpectrumItem) => Promise<void>;
}) {
  const { spectrum, modeLabel, compact = false, onExclude, onRestore } = props;
  return (
    <Card
      size={compact ? "small" : "default"}
      title="当前光谱"
      extra={
        modeLabel ? (
          <Tag color={modeLabel === "悬停中" ? "processing" : "gold"}>{modeLabel}</Tag>
        ) : (
          <Tag>未选中</Tag>
        )
      }
    >
      {!spectrum ? (
        <Empty description="将鼠标悬停到曲线上查看详情" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <div>
            <Title level={compact ? 5 : 4} style={{ marginBottom: 4 }}>
              {spectrum.file_name}
            </Title>
            <Space wrap>
              <Tag color={spectrum.is_excluded ? "default" : "success"}>{spectrum.is_excluded ? "已剔除" : "有效"}</Tag>
              <Tag>{spectrum.class_display_name}</Tag>
              <Tag>{spectrum.point_count} 点</Tag>
            </Space>
          </div>
          <Descriptions column={1} size="small" bordered className={compact ? "detail-descriptions-compact" : undefined}>
            <Descriptions.Item label="成分">{formatSpectrumLabels(spectrum.labels) || "无标签"}</Descriptions.Item>
            <Descriptions.Item label="来源路径">{spectrum.source_path_last_seen}</Descriptions.Item>
            <Descriptions.Item label="设备序列号">
              {String(spectrum.metadata.device_serial ?? "未知")}
            </Descriptions.Item>
            <Descriptions.Item label="扫描配置">{String(spectrum.metadata.scan_config ?? "未知")}</Descriptions.Item>
          </Descriptions>
          <Space wrap>
            {spectrum.is_excluded ? (
              <Button icon={<UndoOutlined />} onClick={() => void onRestore(spectrum)}>
                恢复该光谱
              </Button>
            ) : (
              <Button danger type="primary" onClick={() => void onExclude(spectrum)}>
                剔除该光谱
              </Button>
            )}
          </Space>
        </Space>
      )}
    </Card>
  );
}

function Workspace() {
  const [messageApi, messageContextHolder] = message.useMessage();
  const [notificationApi, notificationContextHolder] = notification.useNotification();
  const screens = Grid.useBreakpoint();
  const compactRightPanel = !screens.xl;

  const [classes, setClasses] = useState<SpectrumClass[]>([]);
  const [classSort, setClassSort] = useState<"count" | "component_count" | "name">("count");
  const [classSearch, setClassSearch] = useState("");
  const deferredClassSearch = useDeferredValue(classSearch);
  const [selectedClass, setSelectedClass] = useState<SpectrumClass | null>(null);
  const [spectra, setSpectra] = useState<SpectrumItem[]>([]);
  const [excludedFilter, setExcludedFilter] = useState<"active" | "excluded" | "all">("active");
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [recentExcluded, setRecentExcluded] = useState<SpectrumItem[]>([]);
  const [importPath, setImportPath] = useState<string | null>(null);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [subsetMode, setSubsetMode] = useState<"count" | "ratio">("count");
  const [subsetInput, setSubsetInput] = useState<string>("4");
  const [subsets, setSubsets] = useState<SubsetSummary[]>([]);
  const [activeSubsetId, setActiveSubsetId] = useState<string | undefined>();
  const [loadingSpectra, setLoadingSpectra] = useState(false);
  const [spectraTotal, setSpectraTotal] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [exportSelectedOnly, setExportSelectedOnly] = useState(true);
  const [hoveredSpectrumId, setHoveredSpectrumId] = useState<number | null>(null);
  const [lockedSpectrumId, setLockedSpectrumId] = useState<number | null>(null);
  const [chartInteractionState, setChartInteractionState] = useState<ChartInteractionState>({
    hoveredSpectrum: null,
    lockedSpectrum: null
  });
  const [pendingUndoSpectrum, setPendingUndoSpectrum] = useState<SpectrumItem | null>(null);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [chartResetToken, setChartResetToken] = useState(0);
  const subscriptionsRef = useRef<Map<number, () => void>>(new Map());

  const canRender = spectraTotal <= 2000;
  const filteredClasses = useMemo(() => {
    const keyword = deferredClassSearch.trim();
    return classes.filter((item) => !keyword || item.class_display_name.includes(keyword));
  }, [classes, deferredClassSearch]);

  const detailSpectrum = chartInteractionState.hoveredSpectrum ?? chartInteractionState.lockedSpectrum ?? pendingUndoSpectrum;
  const detailModeLabel = chartInteractionState.hoveredSpectrum
    ? "悬停中"
    : chartInteractionState.lockedSpectrum
      ? "已锁定"
      : pendingUndoSpectrum
        ? "最近操作"
        : null;
  const selectedClassLabel = selectedClass?.class_display_name ?? "未选择分类";

  useEffect(() => {
    void refreshClasses();
  }, [classSort]);

  useEffect(() => {
    api.recentExcluded().then(setRecentExcluded).catch((error) => setErrorText(String(error)));
    api.listJobs().then(setJobs).catch((error) => setErrorText(String(error)));
    return () => {
      subscriptionsRef.current.forEach((unsubscribe) => unsubscribe());
      subscriptionsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!selectedClass) {
      startTransition(() => {
        setSpectra([]);
        setSpectraTotal(0);
      });
      return;
    }
    void loadSpectra(selectedClass, excludedFilter, activeSubsetId);
  }, [selectedClass, excludedFilter, activeSubsetId]);

  useEffect(() => {
    setChartInteractionState((current) => ({
      hoveredSpectrum: current.hoveredSpectrum ? spectra.find((item) => item.id === current.hoveredSpectrum?.id) ?? null : null,
      lockedSpectrum: current.lockedSpectrum ? spectra.find((item) => item.id === current.lockedSpectrum?.id) ?? current.lockedSpectrum : null
    }));

    if (hoveredSpectrumId !== null && !spectra.some((item) => item.id === hoveredSpectrumId)) {
      setHoveredSpectrumId(null);
    }
  }, [hoveredSpectrumId, spectra]);

  async function refreshClasses() {
    const next = await api.getClasses(classSort);
    startTransition(() => {
      setClasses(next);
      if (selectedClass) {
        const replacement = next.find((item) => item.class_key === selectedClass.class_key) ?? null;
        setSelectedClass(replacement ?? next[0] ?? null);
      } else {
        setSelectedClass((current) => current ?? next[0] ?? null);
      }
    });
  }

  async function refreshExcluded() {
    const items = await api.recentExcluded();
    startTransition(() => setRecentExcluded(items));
  }

  async function loadSpectra(
    targetClass: SpectrumClass,
    targetFilter: "active" | "excluded" | "all",
    subsetId: string | undefined
  ) {
    setLoadingSpectra(true);
    try {
      const data = await api.getSpectra({
        classKey: targetClass.class_key,
        excluded: targetFilter,
        subsetId,
        limit: 2000
      });
      startTransition(() => {
        setSpectra(data.items);
        setSpectraTotal(data.count);
      });
    } catch (error) {
      setErrorText(String(error));
    } finally {
      setLoadingSpectra(false);
    }
  }

  function trackJob(job: JobItem) {
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)].slice(0, 20));
    const unsubscribe = subscribeJob(job.id, (next) => {
      setJobs((current) => [next, ...current.filter((item) => item.id !== next.id)].slice(0, 20));
      if (next.status === "completed" || next.status === "failed") {
        subscriptionsRef.current.get(job.id)?.();
        subscriptionsRef.current.delete(job.id);
      }
      if (next.status === "completed" && next.type === "import") {
        void refreshClasses();
        void refreshExcluded();
      }
    });
    subscriptionsRef.current.set(job.id, unsubscribe);
  }

  async function startImport() {
    try {
      if (!importPath) {
        messageApi.warning("请先选择导入目录");
        return;
      }
      const job = await api.createImportJob(importPath);
      trackJob(job);
      messageApi.success("导入任务已创建");
    } catch (error) {
      const messageText = String(error);
      setErrorText(messageText);
      messageApi.error(`导入任务创建失败：${messageText}`);
    }
  }

  async function startExport(scope: ExportScope) {
    try {
      if (!exportPath) {
        messageApi.warning("请先选择导出目录");
        return;
      }
      if (exportSelectedOnly && !selectedClass) {
        messageApi.warning("请先选择分类，或关闭“仅导出当前选中分类”");
        return;
      }
      const classKeys = exportSelectedOnly && selectedClass ? [selectedClass.class_key] : [];
      const job = await api.createExportJob(exportPath, scope, classKeys);
      trackJob(job);
      messageApi.success(`${EXPORT_SCOPE_LABELS[scope]}光谱导出任务已创建`);
    } catch (error) {
      const messageText = String(error);
      setErrorText(messageText);
      messageApi.error(`导出任务创建失败：${messageText}`);
    }
  }

  async function restoreSpectrumItem(spectrum: SpectrumItem) {
    try {
      const restored = await api.restoreSpectrum(spectrum.id);
      setPendingUndoSpectrum(null);
      setHoveredSpectrumId((current) => (current === restored.id ? restored.id : current));
      if (lockedSpectrumId === restored.id) {
        setChartInteractionState((current) => ({ ...current, lockedSpectrum: restored }));
      }
      setChartInteractionState((current) => ({
        hoveredSpectrum: current.hoveredSpectrum?.id === restored.id ? restored : current.hoveredSpectrum,
        lockedSpectrum: current.lockedSpectrum?.id === restored.id ? restored : current.lockedSpectrum
      }));
      await refreshClasses();
      await refreshExcluded();
      if (selectedClass) {
        await loadSpectra(selectedClass, excludedFilter, activeSubsetId);
      }
      messageApi.success(`已恢复 ${restored.file_name}`);
    } catch (error) {
      const messageText = String(error);
      setErrorText(messageText);
      messageApi.error(`恢复失败：${messageText}`);
    }
  }

  async function handleExclude(spectrum: SpectrumItem) {
    try {
      if (spectrum.is_excluded) {
        return;
      }
      const updated = await api.excludeSpectrum(spectrum.id);
      setLockedSpectrumId(updated.id);
      setHoveredSpectrumId((current) => (current === updated.id ? updated.id : current));
      setChartInteractionState((current) => ({
        hoveredSpectrum: current.hoveredSpectrum?.id === updated.id ? updated : current.hoveredSpectrum,
        lockedSpectrum: updated
      }));
      setPendingUndoSpectrum(updated);
      startTransition(() => {
        setSpectra((current) =>
          current
            .map((item) => (item.id === updated.id ? updated : item))
            .filter((item) => (excludedFilter === "active" ? !item.is_excluded : true))
        );
        setSpectraTotal((current) => Math.max(0, excludedFilter === "active" ? current - 1 : current));
      });
      await refreshClasses();
      await refreshExcluded();

      const notificationKey = `exclude-${updated.id}`;
      notificationApi.open({
        key: notificationKey,
        message: `已剔除 ${updated.file_name}`,
        description: formatSpectrumLabels(updated.labels) || "无标签",
        duration: 6,
        actions: (
          <Button
            size="small"
            type="primary"
            onClick={() => {
              notificationApi.destroy(notificationKey);
              void restoreSpectrumItem(updated);
            }}
          >
            撤销
          </Button>
        )
      });
    } catch (error) {
      const messageText = String(error);
      setErrorText(messageText);
      messageApi.error(`剔除失败：${messageText}`);
    }
  }

  async function handleUndo() {
    if (!pendingUndoSpectrum) {
      return;
    }
    await restoreSpectrumItem(pendingUndoSpectrum);
  }

  async function createSubsets() {
    try {
      if (!selectedClass) {
        messageApi.warning("请先选择分类");
        return;
      }
      const payload =
        subsetMode === "count"
          ? { mode: "count" as const, parts: Math.max(1, Number(subsetInput) || 1) }
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
      messageApi.success(`已生成 ${result.subsets.length} 个子集`);
    } catch (error) {
      const messageText = String(error);
      setErrorText(messageText);
      messageApi.error(`子集切分失败：${messageText}`);
    }
  }

  const rightPanel = (
    <div className="workspace-panel-stack">
      <PathChooserCard
        kind="export"
        currentPath={exportPath}
        onSelect={setExportPath}
        title="导出"
        actionLabel="导出未剔除"
        actionIcon={<CloudDownloadOutlined />}
        onAction={() => startExport("active")}
      />

      <Card title="导出选项" size="small">
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <div className="switch-row">
            <Text>仅导出当前选中分类</Text>
            <Switch checked={exportSelectedOnly} onChange={setExportSelectedOnly} />
          </div>
          <Space wrap>
            <Button onClick={() => void startExport("excluded")}>导出剔除</Button>
            <Button onClick={() => void startExport("all")}>导出全部</Button>
          </Space>
        </Space>
      </Card>

      <Card title="后台任务" size="small">
        <List
          dataSource={jobs}
          locale={{ emptyText: "暂无任务" }}
          renderItem={(job) => {
            const progress = job.total_discovered > 0 ? Math.round((job.processed_count / job.total_discovered) * 100) : job.status === "completed" ? 100 : 0;
            return (
              <List.Item>
                <div className="job-item">
                  <div className="job-item-head">
                    <Text strong>
                      {job.type === "import" ? "导入" : "导出"} #{job.id}
                    </Text>
                    <Tag color={job.status === "completed" ? "success" : job.status === "failed" ? "error" : "processing"}>
                      {job.status}
                    </Tag>
                  </div>
                  <Progress percent={progress} size="small" />
                  <Text type="secondary">
                    {job.type === "export"
                      ? `范围：${EXPORT_SCOPE_LABELS[String(job.params.scope) as ExportScope] ?? "未知"}${Array.isArray(job.params.class_keys) && job.params.class_keys.length > 0 ? ` · ${job.params.class_keys.length} 个分类` : " · 全部分类"}`
                      : job.progress_message}
                  </Text>
                </div>
              </List.Item>
            );
          }}
        />
      </Card>

      <Card title="最近剔除" size="small">
        <List
          dataSource={recentExcluded}
          locale={{ emptyText: "暂无已剔除光谱" }}
          renderItem={(item) => (
            <List.Item
              className="recent-item"
              actions={[
                <Button key={`restore-${item.id}`} type="link" icon={<UndoOutlined />} onClick={() => void restoreSpectrumItem(item)}>
                  恢复
                </Button>
              ]}
            >
              <List.Item.Meta
                title={
                  <Tooltip title={item.file_name}>
                    <span className="ellipsis-text">{item.file_name}</span>
                  </Tooltip>
                }
                description={item.class_display_name}
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#155eef",
          colorSuccess: "#079455",
          colorWarning: "#dc6803",
          colorError: "#d92d20",
          borderRadius: 18,
          colorBgLayout: "#f5f7fb",
          fontFamily: `"Avenir Next", "PingFang SC", "Noto Sans CJK SC", sans-serif`
        }
      }}
    >
      <AntdApp>
        {messageContextHolder}
        {notificationContextHolder}
        <Layout className="workspace-layout">
          <Sider width={336} className="workspace-sider left-sider">
            <div className="workspace-panel-stack">
              <PathChooserCard
                kind="import"
                currentPath={importPath}
                onSelect={setImportPath}
                title="导入"
                actionLabel="开始导入"
                actionIcon={<CloudUploadOutlined />}
                onAction={startImport}
              />

              <Card title="分类总览" extra={<Badge count={filteredClasses.length} color="#155eef" />}>
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  <Input.Search
                    allowClear
                    placeholder="搜索分类名称"
                    value={classSearch}
                    onChange={(event) => setClassSearch(event.target.value)}
                  />
                  <Select
                    value={classSort}
                    onChange={setClassSort}
                    options={[
                      { value: "count", label: "按数量" },
                      { value: "component_count", label: "按组分数" },
                      { value: "name", label: "按名称" }
                    ]}
                  />
                  <List
                    className="class-list"
                    dataSource={filteredClasses}
                    locale={{ emptyText: "没有匹配的分类" }}
                    renderItem={(item) => (
                      <List.Item className={`class-list-item ${selectedClass?.class_key === item.class_key ? "is-selected" : ""}`}>
                        <button
                          className="class-select-button"
                          onClick={() => {
                            setSelectedClass(item);
                            setSubsets([]);
                            setActiveSubsetId(undefined);
                            setHoveredSpectrumId(null);
                            setLockedSpectrumId(null);
                            setChartInteractionState({ hoveredSpectrum: null, lockedSpectrum: null });
                          }}
                        >
                          <div className="class-list-title">{item.class_display_name}</div>
                          <Space wrap size={[4, 8]}>
                            <Tag>{item.component_count} 组分</Tag>
                            <Tag color="blue">总数 {item.total_count}</Tag>
                            <Tag color="success">有效 {item.active_count}</Tag>
                            <Tag color="default">剔除 {item.excluded_count}</Tag>
                          </Space>
                        </button>
                      </List.Item>
                    )}
                  />
                </Space>
              </Card>
            </div>
          </Sider>

          <Layout>
            <Header className="workspace-header">
              <div className="workspace-header-card">
                <div>
                  <Title level={4} style={{ margin: 0 }}>
                    光谱工作台
                  </Title>
                  <Text type="secondary">悬停预览最近曲线，点击即可剔除，并在下方查看完整信息。</Text>
                </div>
                <Space wrap>
                  <Tag icon={<BarChartOutlined />}>{selectedClassLabel}</Tag>
                  {compactRightPanel && (
                    <Button icon={<InfoCircleOutlined />} onClick={() => setRightDrawerOpen(true)}>
                      任务与导出
                    </Button>
                  )}
                </Space>
              </div>
            </Header>

            <Content className="workspace-content">
              <Card className="status-strip" size="small">
                <div className="status-grid">
                  <Statistic title="分类数量" value={classes.length} valueStyle={{ fontSize: 24, lineHeight: 1.1 }} />
                  <Statistic title="当前分类总量" value={selectedClass?.total_count ?? 0} valueStyle={{ fontSize: 24, lineHeight: 1.1 }} />
                  <Statistic title="当前载入曲线" value={spectra.length} valueStyle={{ fontSize: 24, lineHeight: 1.1 }} />
                  <Statistic title="最近任务数" value={jobs.length} valueStyle={{ fontSize: 24, lineHeight: 1.1 }} />
                </div>
              </Card>

              <Card
                size="small"
                title="预览控制"
                extra={
                  <Space wrap>
                    <Select
                      value={excludedFilter}
                      style={{ width: 128 }}
                      onChange={setExcludedFilter}
                      options={[
                        { value: "active", label: "仅有效" },
                        { value: "excluded", label: "仅剔除" },
                        { value: "all", label: "全部" }
                      ]}
                    />
                    <Button
                      aria-label="撤销最近剔除"
                      icon={<UndoOutlined />}
                      disabled={!pendingUndoSpectrum}
                      onClick={() => void handleUndo()}
                    >
                      撤销最近剔除
                    </Button>
                    <Button icon={<ReloadOutlined />} disabled={!selectedClass} onClick={() => selectedClass && void loadSpectra(selectedClass, excludedFilter, activeSubsetId)}>
                      刷新
                    </Button>
                  </Space>
                }
              >
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  <div className="subset-toolbar-inline">
                    <div className="subset-mode-control">
                      <Segmented
                        value={subsetMode}
                        onChange={(value) => setSubsetMode(value as "count" | "ratio")}
                        options={[
                          { label: "按数量切分", value: "count" },
                          { label: "按比例切分", value: "ratio" }
                        ]}
                      />
                      <div className="subset-input-wrap">
                        {subsetMode === "count" ? (
                          <InputNumber
                            min={1}
                            style={{ width: "100%" }}
                            value={Number(subsetInput) || 1}
                            onChange={(value) => setSubsetInput(String(value ?? 1))}
                          />
                        ) : (
                          <Input value={subsetInput} onChange={(event) => setSubsetInput(event.target.value)} placeholder="例如 1,1,1,1" />
                        )}
                      </div>
                    </div>
                    <Button onClick={() => void createSubsets()} disabled={!selectedClass}>
                      生成子集
                    </Button>
                  </div>

                  {subsets.length > 0 && (
                    <Tabs
                      activeKey={activeSubsetId ?? "all"}
                      onChange={(key) => setActiveSubsetId(key === "all" ? undefined : key)}
                      items={[
                        { key: "all", label: "全部" },
                        ...subsets.map((subset) => ({
                          key: subset.subset_id,
                          label: `子集${subset.index} (${subset.count})`
                        }))
                      ]}
                    />
                  )}
                </Space>
              </Card>

              <Card
                size="small"
                title="光谱预览"
                extra={
                  <Space split={<Divider type="vertical" />} size="middle">
                    <Text type="secondary">当前分类：{selectedClassLabel}</Text>
                    <Text type="secondary">总量：{spectraTotal}</Text>
                    <Button size="small" icon={<ReloadOutlined />} onClick={() => setChartResetToken((current) => current + 1)} disabled={!selectedClass || !canRender}>
                      恢复默认缩放
                    </Button>
                  </Space>
                }
              >
                {!selectedClass && <Empty description="请选择左侧分类后开始预览" />}
                {selectedClass && !canRender && (
                  <Alert
                    type="warning"
                    showIcon
                    message={`当前结果共有 ${spectraTotal} 条，超过 2000 条渲染上限`}
                    description="请先切分子集或缩小过滤条件后再预览。"
                  />
                )}
                {selectedClass && canRender && (
                  <Spin spinning={loadingSpectra} tip="正在加载光谱数据...">
                    <SpectrumChart
                      spectra={spectra}
                      resetSignal={chartResetToken}
                      hoveredSpectrumId={hoveredSpectrumId}
                      lockedSpectrumId={lockedSpectrumId}
                      onHoverSpectrum={(spectrum) => {
                        setHoveredSpectrumId(spectrum?.id ?? null);
                        setChartInteractionState((current) => ({ ...current, hoveredSpectrum: spectrum }));
                      }}
                      onLockSpectrum={(spectrum) => {
                        setLockedSpectrumId(spectrum?.id ?? null);
                        setChartInteractionState((current) => ({ ...current, lockedSpectrum: spectrum }));
                      }}
                      onExclude={handleExclude}
                    />
                  </Spin>
                )}
              </Card>

              <DetailCard compact spectrum={detailSpectrum} modeLabel={detailModeLabel} onExclude={handleExclude} onRestore={restoreSpectrumItem} />

              {errorText && <Alert type="error" showIcon message="前端操作失败" description={errorText} />}
            </Content>
          </Layout>

          {!compactRightPanel && (
            <Sider width={352} className="workspace-sider right-sider">
              {rightPanel}
            </Sider>
          )}
        </Layout>

        <Drawer
          title="详情与任务"
          placement="right"
          width={400}
          open={compactRightPanel && rightDrawerOpen}
          onClose={() => setRightDrawerOpen(false)}
        >
          {compactRightPanel ? rightPanel : null}
        </Drawer>
      </AntdApp>
    </ConfigProvider>
  );
}

export default function App() {
  return <Workspace />;
}

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { api, subscribeJob } from "./api";

const baseSpectrum = {
  id: 101,
  file_name: "sample-spectrum.csv",
  source_path_last_seen: "/workspace/imports/sample-spectrum.csv",
  metadata: { device_serial: "SN-001", scan_config: "Hadamard 1" },
  axis_kind: "wavelength",
  axis_unit: "nm",
  point_count: 228,
  x_values: [900, 901, 902],
  y_values: [0.1, 0.2, 0.18],
  labels: [
    { name: "棉", value: 60 },
    { name: "锦纶", value: 40 }
  ],
  class_key: "棉|锦纶",
  class_display_name: "棉、锦纶",
  component_count: 2,
  is_excluded: false,
  excluded_at: null,
  created_at: null,
  updated_at: null
};

const baseClass = {
  class_key: "棉|锦纶",
  class_display_name: "棉、锦纶",
  component_count: 2,
  total_count: 1,
  active_count: 1,
  excluded_count: 0
};

const secondSpectrum = {
  ...baseSpectrum,
  id: 202,
  file_name: "polyester-spectrum.csv",
  source_path_last_seen: "/workspace/imports/polyester-spectrum.csv",
  labels: [{ name: "聚酯纤维", value: 100 }],
  class_key: "聚酯纤维",
  class_display_name: "聚酯纤维",
  component_count: 1
};

const secondClass = {
  class_key: "聚酯纤维",
  class_display_name: "聚酯纤维",
  component_count: 1,
  total_count: 1,
  active_count: 1,
  excluded_count: 0
};

vi.mock("./SpectrumChart", () => ({
  SpectrumChart: ({
    spectra,
    resetSignal: _resetSignal,
    onHoverSpectrum,
    onLockSpectrum,
    onQuickExclude
  }: {
    spectra: Array<typeof baseSpectrum>;
    resetSignal: number;
    onHoverSpectrum: (spectrum: typeof baseSpectrum | null) => void;
    onLockSpectrum: (spectrum: typeof baseSpectrum | null) => void;
    onQuickExclude: (spectrum: typeof baseSpectrum) => void;
  }) => (
    <div data-testid="mock-chart">
      {spectra.map((spectrum) => (
        <button
          key={spectrum.id}
          onMouseEnter={() => onHoverSpectrum(spectrum)}
          onMouseLeave={() => onHoverSpectrum(null)}
          onClick={(event) => {
            if (event.shiftKey) {
              onQuickExclude(spectrum);
              return;
            }
            onLockSpectrum(spectrum);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            onQuickExclude(spectrum);
          }}
        >
          {spectrum.file_name}
        </button>
      ))}
    </div>
  )
}));

vi.mock("./api", () => ({
  api: {
    getRoots: vi.fn(),
    browse: vi.fn(),
    createImportJob: vi.fn(),
    createExportJob: vi.fn(),
    listJobs: vi.fn(),
    getClasses: vi.fn(),
    getSpectra: vi.fn(),
    excludeSpectrum: vi.fn(),
    restoreSpectrum: vi.fn(),
    recentExcluded: vi.fn(),
    createSubsets: vi.fn()
  },
  subscribeJob: vi.fn(() => () => undefined)
}));

describe("App", () => {
  beforeEach(() => {
    let excluded = false;
    vi.clearAllMocks();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1440
    });

    vi.mocked(api.getRoots).mockResolvedValue({
      import_roots: ["/workspace/imports"],
      export_roots: ["/workspace/exports"]
    });
    vi.mocked(api.browse).mockImplementation(async (_kind, path) => ({
      current_path: path,
      parent_path: null,
      entries: []
    }));
    vi.mocked(api.listJobs).mockResolvedValue([]);
    vi.mocked(api.createImportJob).mockResolvedValue({
      id: 1,
      type: "import",
      status: "pending",
      params: {},
      stats: {},
      log_text: "",
      progress_message: "Queued",
      total_discovered: 0,
      processed_count: 0,
      imported_count: 0,
      skipped_count: 0,
      failed_count: 0,
      created_at: null,
      started_at: null,
      finished_at: null,
      updated_at: null
    });
    vi.mocked(api.createExportJob).mockResolvedValue({
      id: 2,
      type: "export",
      status: "pending",
      params: {},
      stats: {},
      log_text: "",
      progress_message: "Queued",
      total_discovered: 0,
      processed_count: 0,
      imported_count: 0,
      skipped_count: 0,
      failed_count: 0,
      created_at: null,
      started_at: null,
      finished_at: null,
      updated_at: null
    });
    vi.mocked(api.getClasses).mockImplementation(async () => [
      {
        ...baseClass,
        active_count: excluded ? 0 : 1,
        excluded_count: excluded ? 1 : 0
      },
      secondClass
    ]);
    vi.mocked(api.getSpectra).mockImplementation(async ({ classKey, excluded: filter }) => ({
      items:
        classKey === secondClass.class_key
          ? filter === "active" || filter === "all"
            ? [{ ...secondSpectrum, is_excluded: false }]
            : []
          : filter === "excluded"
            ? excluded
              ? [{ ...baseSpectrum, is_excluded: true }]
              : []
            : filter === "all"
              ? [{ ...baseSpectrum, is_excluded: excluded }]
              : excluded
                ? []
                : [{ ...baseSpectrum, is_excluded: false }],
      count: 1,
      limit: 2000
    }));
    vi.mocked(api.excludeSpectrum).mockImplementation(async () => {
      excluded = true;
      return { ...baseSpectrum, is_excluded: true };
    });
    vi.mocked(api.restoreSpectrum).mockImplementation(async () => {
      excluded = false;
      return { ...baseSpectrum, is_excluded: false };
    });
    vi.mocked(api.recentExcluded).mockImplementation(async () => (excluded ? [{ ...baseSpectrum, is_excluded: true }] : []));
    vi.mocked(api.createSubsets).mockResolvedValue({
      class_key: baseClass.class_key,
      mode: "count",
      subsets: [{ subset_id: "subset-1", index: 1, count: 1 }]
    });
    vi.mocked(subscribeJob).mockReturnValue(() => undefined);
  });

  it("locks a spectrum and shows its details", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(api.getSpectra).toHaveBeenCalled());
    const curveButton = await screen.findByRole("button", { name: baseSpectrum.file_name });
    await user.click(curveButton);

    expect(await screen.findByText("已锁定")).toBeInTheDocument();
    expect(screen.getByText("棉 60% / 锦纶 40%")).toBeInTheDocument();
    expect(screen.getByText(baseSpectrum.source_path_last_seen)).toBeInTheDocument();
  });

  it("supports shift-left and right-click quick exclude from the chart", async () => {
    render(<App />);

    await waitFor(() => expect(api.getSpectra).toHaveBeenCalled());
    const curveButton = await screen.findByRole("button", { name: baseSpectrum.file_name });

    fireEvent.click(curveButton, { shiftKey: true });
    await waitFor(() => expect(api.excludeSpectrum).toHaveBeenCalledWith(baseSpectrum.id));

    vi.mocked(api.excludeSpectrum).mockClear();
    fireEvent.contextMenu(curveButton);
    await waitFor(() => expect(api.excludeSpectrum).toHaveBeenCalledWith(baseSpectrum.id));
  });

  it("locks a clicked spectrum, then excludes it from the detail card and can undo the action", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(api.getSpectra).toHaveBeenCalled());
    const curveButton = await screen.findByRole("button", { name: baseSpectrum.file_name });
    await user.click(curveButton);

    expect(await screen.findByText("已锁定")).toBeInTheDocument();
    expect(api.excludeSpectrum).not.toHaveBeenCalled();

    await user.click(await screen.findByRole("button", { name: "剔除该光谱" }));
    await waitFor(() => expect(api.excludeSpectrum).toHaveBeenCalledWith(baseSpectrum.id));
    expect(await screen.findByText("最近操作")).toBeInTheDocument();

    const undoButton = (await screen.findAllByRole("button", { name: "撤销最近剔除" })).find((button) => !button.hasAttribute("disabled"));
    expect(undoButton).toBeDefined();
    if (!undoButton) {
      throw new Error("undo button not found");
    }
    await user.click(undoButton);

    await waitFor(() => expect(api.restoreSpectrum).toHaveBeenCalledWith(baseSpectrum.id));
  });

  it("creates export jobs with the selected scope", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(api.getSpectra).toHaveBeenCalled());

    await user.click(await screen.findByRole("button", { name: "导出剔除" }));
    await waitFor(() =>
      expect(api.createExportJob).toHaveBeenCalledWith("/workspace/exports", "excluded", [baseClass.class_key])
    );

    await user.click(await screen.findByRole("button", { name: "导出全部" }));
    await waitFor(() =>
      expect(api.createExportJob).toHaveBeenCalledWith("/workspace/exports", "all", [baseClass.class_key])
    );
  });

  it("creates subsets with the updated count and ratio semantics", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(api.getSpectra).toHaveBeenCalled());

    await user.click(await screen.findByRole("button", { name: "生成子集" }));
    await waitFor(() =>
      expect(api.createSubsets).toHaveBeenCalledWith(baseClass.class_key, { mode: "count", parts: 4 })
    );

    await user.click(screen.getAllByText("按比例切分")[0]);
    const input = screen.getByPlaceholderText("例如 2 表示均分为 2 份");
    await user.clear(input);
    await user.type(input, "2");
    await user.click(await screen.findByRole("button", { name: "生成子集" }));
    await waitFor(() =>
      expect(api.createSubsets).toHaveBeenCalledWith(baseClass.class_key, { mode: "ratio", parts: 2 })
    );
  });

  it("closes subsets and returns to the full preview safely", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(api.getSpectra).toHaveBeenCalled());
    await user.click(await screen.findByRole("button", { name: "生成子集" }));
    expect(await screen.findByRole("tab", { name: "子集1 (1)" })).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "返回全部" }));
    await waitFor(() => expect(screen.queryByRole("tab", { name: "子集1 (1)" })).not.toBeInTheDocument());
  });

  it("clears the previous chart when switching classes", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(api.getSpectra).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: baseSpectrum.file_name })).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /聚酯纤维/ }));
    expect(await screen.findByRole("button", { name: secondSpectrum.file_name })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: baseSpectrum.file_name })).not.toBeInTheDocument();
  });

  it("shows the unsupported-screen message when the viewport is too small", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1200
    });

    render(<App />);

    expect(await screen.findByText("当前窗口过窄")).toBeInTheDocument();
    expect(screen.getByText(/1280px 以上/)).toBeInTheDocument();
    expect(api.getSpectra).not.toHaveBeenCalled();
  });
});

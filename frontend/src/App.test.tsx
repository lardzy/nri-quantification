import { render, screen, waitFor } from "@testing-library/react";
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

vi.mock("./SpectrumChart", () => ({
  SpectrumChart: ({
    spectra,
    resetSignal: _resetSignal,
    onHoverSpectrum,
    onLockSpectrum,
    onExclude
  }: {
    spectra: Array<typeof baseSpectrum>;
    resetSignal: number;
    onHoverSpectrum: (spectrum: typeof baseSpectrum | null) => void;
    onLockSpectrum: (spectrum: typeof baseSpectrum | null) => void;
    onExclude: (spectrum: typeof baseSpectrum) => void;
  }) => (
    <div data-testid="mock-chart">
      {spectra.map((spectrum) => (
        <button
          key={spectrum.id}
          onMouseEnter={() => onHoverSpectrum(spectrum)}
          onMouseLeave={() => onHoverSpectrum(null)}
          onClick={() => {
            onLockSpectrum(spectrum);
            onExclude(spectrum);
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
      }
    ]);
    vi.mocked(api.getSpectra).mockImplementation(async ({ excluded: filter }) => ({
      items:
        filter === "excluded"
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

  it("shows spectrum details when hovering a curve", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(api.getSpectra).toHaveBeenCalled());
    const curveButton = await screen.findByRole("button", { name: baseSpectrum.file_name });
    await user.hover(curveButton);

    expect(await screen.findByText("悬停中")).toBeInTheDocument();
    expect(screen.getByText("棉 60% / 锦纶 40%")).toBeInTheDocument();
    expect(screen.getByText(baseSpectrum.source_path_last_seen)).toBeInTheDocument();
  });

  it("excludes the clicked spectrum and can undo the action", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(api.getSpectra).toHaveBeenCalled());
    const curveButton = await screen.findByRole("button", { name: baseSpectrum.file_name });
    await user.click(curveButton);

    await waitFor(() => expect(api.excludeSpectrum).toHaveBeenCalledWith(baseSpectrum.id));
    expect(await screen.findByText("已剔除")).toBeInTheDocument();

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
});

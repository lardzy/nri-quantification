# NIR Quantification

面向 `14` 类纤维、`1-4` 组分、`900-1700nm / 228点` 的近红外混纺定量离线流水线。

## 功能

- 批量解析设备导出的原始 CSV
- 输出 `manifest`、`rejection report`、`audit report` 和 `group split`
- 使用 `1D Inception` 双头模型做存在性预测和配比回归
- 对单个原始 CSV 做推理，输出最多 4 个纤维及其百分比

## 安装

仅使用数据构建功能时不需要额外依赖。训练和推理需要安装 `torch`：

```bash
pip install -e '.[train]'
```

## 命令

构建 manifest、审计报告和 split：

```bash
nirq build-manifest \
  --input-dir /path/to/raw_csvs \
  --manifest-out outputs/manifest.jsonl \
  --rejections-out outputs/rejections.jsonl \
  --audit-out outputs/audit.json \
  --splits-out outputs/splits.json
```

训练：

```bash
nirq train \
  --manifest outputs/manifest.jsonl \
  --splits outputs/splits.json \
  --output-dir outputs/run_001
```

单文件推理：

```bash
nirq predict \
  --csv /path/to/sample.csv \
  --bundle outputs/run_001/model_bundle.pt
```

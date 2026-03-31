from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import torch

from .modeling import InceptionQuantModel
from .parser import parse_csv_file
from .postprocess import postprocess_prediction


def predict_single_csv(csv_path: str | Path, bundle_path: str | Path) -> dict[str, Any]:
    bundle = torch.load(Path(bundle_path), map_location="cpu")
    record, rejection = parse_csv_file(csv_path, require_labels=False)
    if rejection is not None or record is None:
        reason = rejection["details"] if rejection else "unknown parsing error"
        raise ValueError(f"failed to parse input csv: {reason}")

    model = InceptionQuantModel(fiber_count=len(bundle["fiber_classes"]))
    model.load_state_dict(bundle["model_state_dict"])
    model.eval()

    mean = torch.tensor(bundle["feature_mean"], dtype=torch.float32)
    std = torch.tensor(bundle["feature_std"], dtype=torch.float32)
    features = torch.tensor(record["fixed_absorbance"], dtype=torch.float32)
    features = ((features - mean) / std).unsqueeze(0).unsqueeze(0)

    with torch.no_grad():
        presence_logits, composition_logits = model(features)
        presence_probabilities = torch.sigmoid(presence_logits).squeeze(0).tolist()
        composition_probabilities = torch.softmax(composition_logits, dim=-1).squeeze(0).tolist()

    processed = postprocess_prediction(
        presence_probabilities=presence_probabilities,
        composition_probabilities=composition_probabilities,
        threshold=float(bundle["threshold"]),
    )
    return {
        "file_path": record["file_path"],
        "fabric_id": record["fabric_id"],
        "predicted_components": processed["ranked_components"],
        "threshold": float(bundle["threshold"]),
    }

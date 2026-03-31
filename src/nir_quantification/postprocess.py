from __future__ import annotations

from typing import Any

from .constants import FIBER_CLASSES


def postprocess_prediction(
    presence_probabilities: list[float],
    composition_probabilities: list[float],
    threshold: float,
    max_components: int = 4,
) -> dict[str, Any]:
    candidate_indices = [
        index
        for index, probability in enumerate(presence_probabilities)
        if probability >= threshold
    ]
    if not candidate_indices:
        candidate_indices = [max(range(len(presence_probabilities)), key=lambda index: presence_probabilities[index])]
    if len(candidate_indices) > max_components:
        candidate_indices = sorted(candidate_indices, key=lambda index: presence_probabilities[index], reverse=True)[:max_components]

    restricted_scores = [composition_probabilities[index] for index in candidate_indices]
    score_sum = sum(restricted_scores)
    if score_sum <= 0:
        normalized_scores = [100.0 / len(candidate_indices)] * len(candidate_indices)
    else:
        normalized_scores = [score * 100.0 / score_sum for score in restricted_scores]

    dense_percentages = [0.0] * len(FIBER_CLASSES)
    ranked = []
    for index, percentage in zip(candidate_indices, normalized_scores):
        dense_percentages[index] = percentage
        ranked.append(
            {
                "fiber": FIBER_CLASSES[index],
                "percentage": percentage,
                "presence_probability": presence_probabilities[index],
            }
        )
    ranked.sort(key=lambda item: item["percentage"], reverse=True)
    return {
        "candidate_indices": candidate_indices,
        "dense_percentages": dense_percentages,
        "ranked_components": ranked,
    }

from __future__ import annotations

import unittest

from nir_quantification.postprocess import postprocess_prediction


class PostprocessTests(unittest.TestCase):
    def test_falls_back_to_top1_when_threshold_filters_all(self) -> None:
        result = postprocess_prediction(
            presence_probabilities=[0.1, 0.2, 0.3],
            composition_probabilities=[0.2, 0.3, 0.5],
            threshold=0.9,
            max_components=4,
        )
        self.assertEqual(len(result["ranked_components"]), 1)
        self.assertAlmostEqual(sum(result["dense_percentages"]), 100.0, places=6)

    def test_caps_output_to_top4(self) -> None:
        result = postprocess_prediction(
            presence_probabilities=[0.95, 0.9, 0.85, 0.8, 0.75],
            composition_probabilities=[0.1, 0.2, 0.3, 0.15, 0.25],
            threshold=0.7,
            max_components=4,
        )
        self.assertEqual(len(result["ranked_components"]), 4)
        self.assertAlmostEqual(sum(result["dense_percentages"]), 100.0, places=6)


if __name__ == "__main__":
    unittest.main()

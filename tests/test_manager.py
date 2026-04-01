from __future__ import annotations

import tempfile
import time
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from nir_quantification.manager.app import create_app
from nir_quantification.manager.config import ManagerSettings


def make_csv_text(labels: list[tuple[str, float]], point_count: int = 228) -> str:
    lines = [
        "***Scan Config Information***,,,,,,,***Reference Scan Information***,,,,,,,,",
        "Scan Config Name:,Hadamard 1,,,,,,Scan Config Name:,Built-in Factory Reference,,,,,,",
        "Serial Number:,SN123,,,,,,,,,,,,,",
        "***Scan Data***,,,,,,,,,,,,,,,",
        "Wavelength (nm),Absorbance (AU),Reference Signal (unitless),Sample Signal (unitless)",
    ]
    for index in range(point_count):
        wavelength = 900.0 + index * (800.0 / (point_count - 1)) if point_count > 1 else 900.0
        absorbance = 0.1 + index * 0.001
        lines.append(f"{wavelength:.6f},{absorbance:.6f},{1000 + index:.1f},{900 + index}")
    lines.append("***End of Scan Data***")
    for name, value in labels:
        lines.append(f"{name},{value}")
    return "\n".join(lines) + "\n"


class ManagerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.temp_dir.name)
        self.import_root = self.base_dir / "imports"
        self.export_root = self.base_dir / "exports"
        self.import_root.mkdir()
        self.export_root.mkdir()

        settings = ManagerSettings(
            db_path=self.base_dir / "data" / "spectra.sqlite3",
            import_roots=[self.import_root],
            export_roots=[self.export_root],
            static_dir=None,
            max_workers=2,
            job_batch_size=2,
        )
        self.client = TestClient(create_app(settings))

    def tearDown(self) -> None:
        self.client.close()
        self.temp_dir.cleanup()

    def test_import_classification_subset_and_exclusion_flow(self) -> None:
        nested_a = self.import_root / "batch-a"
        nested_b = self.import_root / "batch-b"
        nested_c = self.import_root / "batch-c"
        nested_d = self.import_root / "batch-d"
        nested_a.mkdir()
        nested_b.mkdir()
        nested_c.mkdir()
        nested_d.mkdir()

        file_name_a = "ISC_Hadamard 1_棉,70.0,锦纶,30.0_ABC123_20240101_120000_1.csv"
        file_name_b = "ISC_Hadamard 1_锦纶,20.0,棉,80.0_DEF456_20240101_120100_1.csv"
        file_name_c = "ISC_Hadamard 1_棉,65.0,锦纶,35.0_GHI789_20240101_120200_1.csv"
        file_name_d = "ISC_Hadamard 1_锦纶,10.0,棉,90.0_JKL012_20240101_120300_1.csv"
        (nested_a / file_name_a).write_text(make_csv_text([("棉", 70.0), ("锦纶", 30.0)]), encoding="utf-8")
        (nested_b / file_name_b).write_text(make_csv_text([("锦纶", 20.0), ("棉", 80.0)]), encoding="utf-8")
        (nested_c / file_name_c).write_text(make_csv_text([("棉", 65.0), ("锦纶", 35.0)]), encoding="utf-8")
        (nested_d / file_name_d).write_text(make_csv_text([("锦纶", 10.0), ("棉", 90.0)]), encoding="utf-8")
        duplicate_dir = nested_b / "duplicates"
        duplicate_dir.mkdir()
        (duplicate_dir / file_name_a).write_text(make_csv_text([("棉", 70.0), ("锦纶", 30.0)]), encoding="utf-8")

        job = self.client.post("/api/import-jobs", json={"root_path": str(self.import_root), "recursive": True}).json()
        completed = self._wait_for_job(job["id"])
        self.assertEqual(completed["status"], "completed")
        self.assertEqual(completed["total_discovered"], 5)
        self.assertEqual(completed["imported_count"], 4)
        self.assertEqual(completed["skipped_count"], 1)
        self.assertEqual(completed["failed_count"], 0)

        browse = self.client.get("/api/fs/browse", params={"kind": "import", "path": str(nested_b)}).json()
        self.assertEqual(browse["parent_path"], str(self.import_root.resolve()))

        classes = self.client.get("/api/classes", params={"sort": "name"}).json()["items"]
        self.assertEqual(len(classes), 1)
        self.assertEqual(classes[0]["class_key"], "棉|锦纶")
        self.assertEqual(classes[0]["total_count"], 4)

        class_key = classes[0]["class_key"]
        spectra_payload = self.client.get(
            "/api/spectra",
            params={"class_key": class_key, "excluded": "active", "limit": 1},
        ).json()
        self.assertEqual(spectra_payload["count"], 4)
        self.assertEqual(len(spectra_payload["items"]), 1)

        subset_payload = self.client.post(
            f"/api/classes/{class_key}/subsets",
            json={"mode": "count", "parts": 2},
        ).json()
        self.assertEqual(len(subset_payload["subsets"]), 2)
        subset_counts = [item["count"] for item in subset_payload["subsets"]]
        self.assertEqual(subset_counts, [2, 2])

        ratio_subset_payload = self.client.post(
            f"/api/classes/{class_key}/subsets",
            json={"mode": "ratio", "parts": 2},
        ).json()
        self.assertEqual(len(ratio_subset_payload["subsets"]), 2)
        ratio_subset_ids = [item["subset_id"] for item in ratio_subset_payload["subsets"]]
        ratio_subset_counts = [item["count"] for item in ratio_subset_payload["subsets"]]
        self.assertEqual(ratio_subset_counts, [2, 2])

        subset_spectra = self.client.get(
            "/api/spectra",
            params={"class_key": class_key, "excluded": "active", "subset_id": ratio_subset_ids[0], "limit": 2000},
        ).json()
        self.assertEqual(subset_spectra["count"], 2)
        self.assertEqual(len(subset_spectra["items"]), 2)

        spectrum_id = subset_spectra["items"][0]["id"]
        excluded = self.client.post(f"/api/spectra/{spectrum_id}/exclude").json()
        self.assertTrue(excluded["is_excluded"])

        recent_excluded = self.client.get("/api/excluded/recent", params={"limit": 10}).json()["items"]
        self.assertEqual(recent_excluded[0]["id"], spectrum_id)

        restored = self.client.post(f"/api/spectra/{spectrum_id}/restore").json()
        self.assertFalse(restored["is_excluded"])

    def test_reimport_skips_existing_file_names(self) -> None:
        file_name = "ISC_Hadamard 1_聚酯纤维,100.0_ABC123_20240101_120000_1.csv"
        (self.import_root / file_name).write_text(make_csv_text([("聚酯纤维", 100.0)]), encoding="utf-8")

        first_job = self.client.post("/api/import-jobs", json={"root_path": str(self.import_root), "recursive": True}).json()
        first_completed = self._wait_for_job(first_job["id"])
        self.assertEqual(first_completed["imported_count"], 1)
        self.assertEqual(first_completed["skipped_count"], 0)

        second_job = self.client.post("/api/import-jobs", json={"root_path": str(self.import_root), "recursive": True}).json()
        second_completed = self._wait_for_job(second_job["id"])
        self.assertEqual(second_completed["imported_count"], 0)
        self.assertEqual(second_completed["skipped_count"], 1)
        self.assertEqual(second_completed["failed_count"], 0)

    def test_export_preserves_original_csv_text(self) -> None:
        file_name = "ISC_Hadamard 1_氨纶,40.0,棉,60.0_ABC123_20240101_120000_1.csv"
        original_text = make_csv_text([("氨纶", 40.0), ("棉", 60.0)])
        (self.import_root / file_name).write_text(original_text, encoding="utf-8")

        import_job = self.client.post("/api/import-jobs", json={"root_path": str(self.import_root), "recursive": True}).json()
        self._wait_for_job(import_job["id"])

        export_job = self.client.post(
            "/api/export-jobs",
            json={"export_root": str(self.export_root), "scope": "active", "class_keys": []},
        ).json()
        completed = self._wait_for_job(export_job["id"])
        self.assertEqual(completed["status"], "completed")
        self.assertEqual(completed["imported_count"], 1)
        self.assertEqual(completed["failed_count"], 0)

        exported_candidates = list((self.export_root / "active").rglob(file_name))
        self.assertEqual(len(exported_candidates), 1)
        exported_path = exported_candidates[0]
        self.assertTrue(exported_path.exists())
        self.assertEqual(exported_path.read_text(encoding="utf-8"), original_text)

    def _wait_for_job(self, job_id: int, timeout_seconds: float = 10.0) -> dict:
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            payload = self.client.get(f"/api/jobs/{job_id}").json()
            if payload["status"] in {"completed", "failed"}:
                return payload
            time.sleep(0.05)
        self.fail(f"job {job_id} did not finish before timeout")


if __name__ == "__main__":
    unittest.main()

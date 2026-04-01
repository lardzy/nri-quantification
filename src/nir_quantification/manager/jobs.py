from __future__ import annotations

import gzip
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from .config import ManagerSettings
from .db import decode_json, encode_json, session_scope
from .models import Job, Spectrum
from .parsers import ParserRegistry
from .service import job_to_dict, spectrum_query, upsert_spectrum_from_parsed, utcnow


class SubsetStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subsets: dict[str, dict[str, Any]] = {}

    def put(self, subset_id: str, payload: dict[str, Any]) -> None:
        with self._lock:
            self._subsets[subset_id] = payload

    def get(self, subset_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._subsets.get(subset_id)


class JobManager:
    def __init__(self, settings: ManagerSettings, session_factory: sessionmaker, parser_registry: ParserRegistry) -> None:
        self.settings = settings
        self.session_factory = session_factory
        self.parser_registry = parser_registry
        self.subsets = SubsetStore()

    def create_import_job(self, root_path: Path, recursive: bool = True) -> dict[str, Any]:
        with session_scope(self.session_factory) as session:
            job = Job(
                type="import",
                status="pending",
                params_json=encode_json({"root_path": str(root_path), "recursive": recursive}),
                stats_json=encode_json({}),
                progress_message="Queued",
            )
            session.add(job)
            session.flush()
            job_id = job.id
        self._spawn(target=self._run_import_job, job_id=job_id)
        return self.get_job(job_id)

    def create_export_job(self, export_root: Path, scope: str, class_keys: list[str] | None = None) -> dict[str, Any]:
        params = {"export_root": str(export_root), "scope": scope, "class_keys": class_keys or []}
        with session_scope(self.session_factory) as session:
            job = Job(
                type="export",
                status="pending",
                params_json=encode_json(params),
                stats_json=encode_json({}),
                progress_message="Queued",
            )
            session.add(job)
            session.flush()
            job_id = job.id
        self._spawn(target=self._run_export_job, job_id=job_id)
        return self.get_job(job_id)

    def get_job(self, job_id: int) -> dict[str, Any]:
        with session_scope(self.session_factory) as session:
            job = session.get(Job, job_id)
            if job is None:
                raise KeyError(f"job {job_id} not found")
            return job_to_dict(job)

    def create_subset(
        self,
        class_key: str,
        mode: str,
        parts: int | None,
        ratios: list[float] | None,
        spectrum_ids: list[int],
    ) -> dict[str, Any]:
        import uuid

        subsets: list[dict[str, Any]] = []
        if mode == "count":
            chunk_size = max(1, parts or 1)
            groups = [spectrum_ids[index:index + chunk_size] for index in range(0, len(spectrum_ids), chunk_size)]
        else:
            raw_partition_count = parts if parts is not None else int(ratios[0]) if ratios else 1
            partition_count = max(1, raw_partition_count)
            base_size = len(spectrum_ids) // partition_count
            remainder = len(spectrum_ids) % partition_count
            groups = []
            cursor = 0
            for index in range(partition_count):
                size = base_size + (1 if index < remainder else 0)
                groups.append(spectrum_ids[cursor:cursor + size])
                cursor += size

        for index, ids in enumerate(groups, start=1):
            if not ids:
                continue
            subset_id = uuid.uuid4().hex
            payload = {"subset_id": subset_id, "class_key": class_key, "index": index, "spectrum_ids": ids}
            self.subsets.put(subset_id, payload)
            subsets.append({"subset_id": subset_id, "index": index, "count": len(ids)})
        return {"class_key": class_key, "mode": mode, "subsets": subsets}

    def _spawn(self, target, job_id: int) -> None:
        thread = threading.Thread(target=target, kwargs={"job_id": job_id}, daemon=True)
        thread.start()

    def _run_import_job(self, job_id: int) -> None:
        with session_scope(self.session_factory) as session:
            job = session.get(Job, job_id)
            assert job is not None
            params = decode_json(job.params_json, {})
            root_path = Path(params["root_path"])
            recursive = bool(params.get("recursive", True))
            job.status = "running"
            job.started_at = utcnow()
            job.progress_message = "Scanning files"

        try:
            paths = sorted(root_path.rglob("*.csv") if recursive else root_path.glob("*.csv"))
            unique_paths: list[Path] = []
            seen_names: set[str] = set()
            duplicate_paths: list[Path] = []
            for path in paths:
                if path.name in seen_names:
                    duplicate_paths.append(path)
                    continue
                seen_names.add(path.name)
                unique_paths.append(path)

            imported = 0
            skipped = len(duplicate_paths)
            failed = 0
            processed = len(duplicate_paths)
            self._update_job(
                job_id,
                total_discovered=len(paths),
                processed_count=processed,
                skipped_count=skipped,
                progress_message=f"Found {len(paths)} CSV files",
            )
            for path in duplicate_paths:
                self._append_log(job_id, f"[duplicate-file-name] {path.name}: skipped duplicate discovered in import tree")

            with ThreadPoolExecutor(max_workers=self.settings.max_workers) as executor:
                future_map = {executor.submit(self.parser_registry.parse, path): path for path in unique_paths}
                batch = []
                for future in as_completed(future_map):
                    path = future_map[future]
                    try:
                        batch.append(future.result())
                    except Exception as error:
                        failed += 1
                        processed += 1
                        self._append_log(job_id, f"[import-error] {path.name}: {error}")
                        self._update_job(
                            job_id,
                            processed_count=processed,
                            imported_count=imported,
                            skipped_count=skipped,
                            failed_count=failed,
                            progress_message=f"Imported {imported}, skipped {skipped}, failed {failed}",
                        )
                        continue
                    if len(batch) >= self.settings.job_batch_size:
                        batch_imported, batch_skipped = self._flush_import_batch(batch)
                        imported += batch_imported
                        skipped += batch_skipped
                        processed += len(batch)
                        batch = []
                        self._update_job(
                            job_id,
                            processed_count=processed,
                            imported_count=imported,
                            skipped_count=skipped,
                            failed_count=failed,
                            progress_message=f"Imported {imported}, skipped {skipped}, failed {failed}",
                        )

                if batch:
                    batch_imported, batch_skipped = self._flush_import_batch(batch)
                    imported += batch_imported
                    skipped += batch_skipped
                    processed += len(batch)

            self._finish_job(
                job_id,
                status="completed",
                processed_count=processed,
                imported_count=imported,
                skipped_count=skipped,
                failed_count=failed,
                progress_message=f"Completed import: {imported} imported, {skipped} skipped, {failed} failed",
            )
        except Exception as error:  # pragma: no cover
            self._append_log(job_id, traceback.format_exc())
            self._finish_job(job_id, status="failed", progress_message=str(error))

    def _flush_import_batch(self, batch) -> tuple[int, int]:
        imported = skipped = 0
        if not batch:
            return imported, skipped
        with session_scope(self.session_factory) as session:
            for parsed in batch:
                result = upsert_spectrum_from_parsed(session, parsed)
                if result == "imported":
                    imported += 1
                else:
                    skipped += 1
        return imported, skipped

    def _run_export_job(self, job_id: int) -> None:
        with session_scope(self.session_factory) as session:
            job = session.get(Job, job_id)
            assert job is not None
            params = decode_json(job.params_json, {})
            export_root = Path(params["export_root"])
            scope = params["scope"]
            class_keys = params.get("class_keys") or []
            job.status = "running"
            job.started_at = utcnow()
            job.progress_message = "Preparing export"

            stmt = spectrum_query(session, None, "all" if scope == "all" else scope, None)
            if class_keys:
                stmt = stmt.where(Spectrum.class_key.in_(class_keys))
            spectra = session.scalars(stmt).unique().all()
            payload = [
                {
                    "file_name": spectrum.file_name,
                    "class_display_name": spectrum.class_display_name,
                    "raw_csv_gzip": spectrum.raw_csv_gzip,
                }
                for spectrum in spectra
            ]
        export_root.mkdir(parents=True, exist_ok=True)
        self._update_job(job_id, total_discovered=len(payload), progress_message=f"Exporting {len(payload)} files")

        written = failed = 0
        try:
            with ThreadPoolExecutor(max_workers=self.settings.max_workers) as executor:
                future_map = {
                    executor.submit(self._write_export_file, export_root, scope, item): item["file_name"]
                    for item in payload
                }
                for completed, future in enumerate(as_completed(future_map), start=1):
                    try:
                        future.result()
                        written += 1
                    except Exception as error:
                        failed += 1
                        self._append_log(job_id, f"[export-error] {future_map[future]}: {error}")
                    self._update_job(
                        job_id,
                        processed_count=completed,
                        imported_count=written,
                        failed_count=failed,
                        progress_message=f"Exported {written}, failed {failed}",
                    )
            self._finish_job(
                job_id,
                status="completed",
                processed_count=len(payload),
                imported_count=written,
                failed_count=failed,
                progress_message=f"Completed export: {written} written, {failed} failed",
            )
        except Exception as error:  # pragma: no cover
            self._append_log(job_id, traceback.format_exc())
            self._finish_job(job_id, status="failed", progress_message=str(error))

    def _write_export_file(self, export_root: Path, scope: str, item: dict[str, Any]) -> None:
        target_dir = export_root / scope / _safe_dir_name(item["class_display_name"] or "未分类")
        target_dir.mkdir(parents=True, exist_ok=True)
        raw_text = gzip.decompress(item["raw_csv_gzip"]).decode("utf-8")
        (target_dir / item["file_name"]).write_text(raw_text, encoding="utf-8")

    def _update_job(self, job_id: int, **fields) -> None:
        with session_scope(self.session_factory) as session:
            job = session.get(Job, job_id)
            if job is None:
                return
            for key, value in fields.items():
                setattr(job, key, value)

    def _append_log(self, job_id: int, message: str) -> None:
        with session_scope(self.session_factory) as session:
            job = session.get(Job, job_id)
            if job is None:
                return
            existing = job.log_text or ""
            job.log_text = f"{existing}{message}\n"

    def _finish_job(self, job_id: int, status: str, progress_message: str, **fields) -> None:
        with session_scope(self.session_factory) as session:
            job = session.get(Job, job_id)
            if job is None:
                return
            job.status = status
            job.finished_at = utcnow()
            job.progress_message = progress_message
            for key, value in fields.items():
                setattr(job, key, value)


def _safe_dir_name(name: str) -> str:
    return name.replace("/", "_").replace("\\", "_").strip() or "未分类"

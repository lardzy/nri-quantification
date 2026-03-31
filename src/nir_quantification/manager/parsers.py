from __future__ import annotations

import gzip
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from ..constants import FIBER_CLASSES
from ..parser import parse_csv_file


@dataclass(slots=True)
class ParsedComponent:
    name: str
    value: float


@dataclass(slots=True)
class ParsedSpectrum:
    file_name: str
    source_path: str
    raw_csv_gzip: bytes
    metadata: dict
    axis_kind: str
    axis_unit: str
    point_count: int
    x_values: list[float]
    y_values: list[float]
    labels: list[ParsedComponent]


class SpectrumParser(Protocol):
    def can_parse(self, path: Path) -> bool: ...

    def parse(self, path: Path) -> ParsedSpectrum: ...


class NIRCsvParser:
    def can_parse(self, path: Path) -> bool:
        return path.suffix.lower() == ".csv"

    def parse(self, path: Path) -> ParsedSpectrum:
        raw_text = path.read_text(encoding="utf-8-sig")
        record, rejection = parse_csv_file(path, require_labels=True)
        if rejection is not None or record is None:
            reason = rejection["details"] if rejection is not None else "unknown parse error"
            raise ValueError(reason)

        labels = [
            ParsedComponent(name=FIBER_CLASSES[index], value=value)
            for index, value in enumerate(record["composition_14"])
            if value > 0
        ]
        metadata = {
            "fabric_id": record["fabric_id"],
            "date": record["date"],
            "time": record["time"],
            "repeat": record["repeat"],
            "device_serial": record["device_serial"],
            "scan_config": record["scan_config"],
            "warnings": record["warnings"],
            "label_source": record["label_source"],
            "parser_name": "nir_csv_v1",
        }
        return ParsedSpectrum(
            file_name=path.name,
            source_path=str(path.resolve()),
            raw_csv_gzip=gzip.compress(raw_text.encode("utf-8")),
            metadata=metadata,
            axis_kind="wavelength",
            axis_unit="nm",
            point_count=len(record["raw_wavelengths"]),
            x_values=record["raw_wavelengths"],
            y_values=record["absorbance"],
            labels=labels,
        )


class ParserRegistry:
    def __init__(self, parsers: list[SpectrumParser] | None = None) -> None:
        self.parsers = parsers or [NIRCsvParser()]

    def parse(self, path: Path) -> ParsedSpectrum:
        for parser in self.parsers:
            if parser.can_parse(path):
                return parser.parse(path)
        raise ValueError(f"no parser found for {path.name}")

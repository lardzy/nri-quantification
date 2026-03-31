from __future__ import annotations

FIBER_CLASSES = [
    "氨纶",
    "动物毛纤维",
    "聚乳酸纤维",
    "锦纶",
    "醋纤",
    "芳纶",
    "再生纤维素纤维",
    "棉",
    "聚酰亚胺纤维",
    "腈纶",
    "桑蚕丝",
    "聚酯纤维",
    "丙纶",
    "乙纶",
]

FIBER_TO_INDEX = {name: index for index, name in enumerate(FIBER_CLASSES)}

FIBER_ALIASES = {
    "动物毛": "动物毛纤维",
    "再生纤维素": "再生纤维素纤维",
    "聚酯": "聚酯纤维",
    "涤纶": "聚酯纤维",
    "尼龙": "锦纶",
    "蚕丝": "桑蚕丝",
    "丝": "桑蚕丝",
}

FIXED_WAVELENGTH_START = 900.0
FIXED_WAVELENGTH_END = 1700.0
FIXED_GRID_SIZE = 228
FIXED_WAVELENGTHS = [
    FIXED_WAVELENGTH_START
    + index * (FIXED_WAVELENGTH_END - FIXED_WAVELENGTH_START) / (FIXED_GRID_SIZE - 1)
    for index in range(FIXED_GRID_SIZE)
]

LABEL_SUM_TARGET = 100.0
LABEL_SUM_TOLERANCE = 0.5


def normalize_fiber_name(name: str) -> str | None:
    cleaned = name.strip()
    if cleaned in FIBER_TO_INDEX:
        return cleaned
    if cleaned in FIBER_ALIASES:
        return FIBER_ALIASES[cleaned]
    return None

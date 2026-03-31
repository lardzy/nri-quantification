from __future__ import annotations

import torch
from torch import nn

from .constants import FIBER_CLASSES


class Inception1DBlock(nn.Module):
    def __init__(self, in_channels: int, out_channels: int) -> None:
        super().__init__()
        if out_channels % 4 != 0:
            raise ValueError("out_channels must be divisible by 4")
        branch_channels = out_channels // 4
        bottleneck = max(branch_channels // 2, 8)

        self.branch1 = nn.Sequential(
            nn.Conv1d(in_channels, branch_channels, kernel_size=1),
            nn.GELU(),
        )
        self.branch2 = nn.Sequential(
            nn.Conv1d(in_channels, bottleneck, kernel_size=1),
            nn.GELU(),
            nn.Conv1d(bottleneck, branch_channels, kernel_size=3, padding=1),
            nn.GELU(),
        )
        self.branch3 = nn.Sequential(
            nn.Conv1d(in_channels, bottleneck, kernel_size=1),
            nn.GELU(),
            nn.Conv1d(bottleneck, branch_channels, kernel_size=5, padding=2),
            nn.GELU(),
        )
        self.branch4 = nn.Sequential(
            nn.MaxPool1d(kernel_size=3, stride=1, padding=1),
            nn.Conv1d(in_channels, branch_channels, kernel_size=1),
            nn.GELU(),
        )
        self.output_norm = nn.BatchNorm1d(out_channels)

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        merged = torch.cat(
            [
                self.branch1(inputs),
                self.branch2(inputs),
                self.branch3(inputs),
                self.branch4(inputs),
            ],
            dim=1,
        )
        return self.output_norm(merged)


class InceptionQuantModel(nn.Module):
    def __init__(self, fiber_count: int = len(FIBER_CLASSES)) -> None:
        super().__init__()
        self.stem = nn.Sequential(
            nn.Conv1d(1, 32, kernel_size=7, padding=3),
            nn.BatchNorm1d(32),
            nn.GELU(),
        )
        self.block1 = Inception1DBlock(32, 128)
        self.block2 = Inception1DBlock(128, 128)
        self.pool = nn.AdaptiveAvgPool1d(1)
        self.shared = nn.Sequential(
            nn.Linear(128, 64),
            nn.GELU(),
            nn.Dropout(0.2),
        )
        self.presence_head = nn.Linear(64, fiber_count)
        self.composition_head = nn.Linear(64, fiber_count)

    def forward(self, inputs: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        features = self.stem(inputs)
        features = self.block1(features)
        features = self.block2(features)
        pooled = self.pool(features).squeeze(-1)
        shared = self.shared(pooled)
        return self.presence_head(shared), self.composition_head(shared)

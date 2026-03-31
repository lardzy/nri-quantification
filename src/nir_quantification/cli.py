from __future__ import annotations

import argparse
import json
from pathlib import Path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="nirq", description="NIR quantification pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)

    build_parser = subparsers.add_parser("build-manifest", help="Build manifest, audit report, and split definition")
    build_parser.add_argument("--input-dir", required=True)
    build_parser.add_argument("--manifest-out", required=True)
    build_parser.add_argument("--rejections-out", required=True)
    build_parser.add_argument("--audit-out", required=True)
    build_parser.add_argument("--splits-out", required=True)

    train_parser = subparsers.add_parser("train", help="Train the baseline model")
    train_parser.add_argument("--manifest", required=True)
    train_parser.add_argument("--splits", required=True)
    train_parser.add_argument("--output-dir", required=True)

    predict_parser = subparsers.add_parser("predict", help="Predict a single raw CSV")
    predict_parser.add_argument("--csv", required=True)
    predict_parser.add_argument("--bundle", required=True)

    args = parser.parse_args(argv)

    if args.command == "build-manifest":
        from .build import build_manifest_bundle

        result = build_manifest_bundle(
            input_dir=args.input_dir,
            manifest_out=args.manifest_out,
            rejections_out=args.rejections_out,
            audit_out=args.audit_out,
            splits_out=args.splits_out,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    if args.command == "train":
        try:
            from .train import train_pipeline
        except ModuleNotFoundError as error:
            if error.name == "torch":
                raise SystemExit("train command requires torch. Install it with: pip install -e '.[train]'") from error
            raise

        result = train_pipeline(
            manifest_path=args.manifest,
            splits_path=args.splits,
            output_dir=args.output_dir,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    if args.command == "predict":
        try:
            from .predict import predict_single_csv
        except ModuleNotFoundError as error:
            if error.name == "torch":
                raise SystemExit("predict command requires torch. Install it with: pip install -e '.[train]'") from error
            raise

        result = predict_single_csv(args.csv, args.bundle)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    return 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())

#!/usr/bin/env python3
"""Apply guarded dynamic-shape constraints for pinned Laya 0.4.8 on PyTorch 2.9.

Only the torch.export tracing constraints are modified. The upstream exporter still
checks the resulting ONNX encoder/head at real batch sizes 1 and 2, and will
fail rather than publish an unverified bundle.
"""
import argparse
from pathlib import Path

REPLACEMENTS = (
    ('batch_dim = torch.export.Dim("batch", min=1, max=64)',
     'batch_dim = torch.export.Dim("batch", min=2, max=64)'),
    # The head uses topk(2) on markers, so a single marker is not a valid trace.
    ('markers_dim = torch.export.Dim("markers", min=1, max=256)',
     'markers_dim = torch.export.Dim("markers", min=2, max=256)'),
)


def patched_source(source: str) -> str:
    result = source
    for original, patched in REPLACEMENTS:
        old_count = result.count(original)
        new_count = result.count(patched)
        if old_count == 1 and new_count == 0:
            result = result.replace(original, patched, 1)
        elif old_count == 0 and new_count == 1:
            pass  # idempotent on rerun
        else:
            raise ValueError(
                "Unexpected pinned Laya exporter: expected exactly one original "
                "or patched dynamic-shape definition. Refusing to modify source."
            )
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', type=Path, help='Pinned laya-ts/scripts/export_onnx.py')
    args = parser.parse_args()
    source = args.path.read_text(encoding='utf-8')
    updated = patched_source(source)
    if source != updated:
        args.path.write_text(updated, encoding='utf-8')
        print('Applied Laya export shape workaround (minimum batch=2, markers=2).')
    else:
        print('Laya export shape workaround already applied.')


if __name__ == '__main__':
    main()

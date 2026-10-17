import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'patch-laya-onnx-export.py'
spec = importlib.util.spec_from_file_location('laya_export_patch', SCRIPT)
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)


class LayaExportPatchTests(unittest.TestCase):
    def test_restricts_only_tracing_dynamic_dimensions(self):
        source = '''batch_dim = torch.export.Dim("batch", min=1, max=64)
seq_dim = torch.export.Dim("seq", min=1, max=8192)
markers_dim = torch.export.Dim("markers", min=1, max=256)
_verify(enc_path, head_path, torch.ones(1, seq, dtype=torch.long))
'''
        updated = patch.patched_source(source)
        for original, patched in patch.REPLACEMENTS:
            self.assertIn(patched, updated)
            self.assertNotIn(original, updated)
        self.assertIn('torch.ones(1, seq', updated)
        self.assertIn('seq_dim = torch.export.Dim("seq", min=1', updated)
        self.assertEqual(patch.patched_source(updated), updated)

    def test_unexpected_source_fails_closed(self):
        with self.assertRaisesRegex(ValueError, 'Unexpected pinned Laya exporter'):
            patch.patched_source('batch_dim = torch.export.Dim("batch", min=1, max=32)')
        with self.assertRaises(ValueError):
            patch.patched_source(patch.REPLACEMENTS[0][0] + '\n' + patch.REPLACEMENTS[0][0])
        with self.assertRaises(ValueError):
            patch.patched_source(patch.REPLACEMENTS[0][0] + '\n' + patch.REPLACEMENTS[0][1])


if __name__ == '__main__':
    unittest.main()

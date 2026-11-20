"""Only synthetic fixtures; never approve or read private teaching material."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/academy-stage.py'


class StagingTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / 'approved'
        self.source.mkdir()
        self.data = b'<!doctype html><title>Synthetic Academy fixture</title>'
        (self.source / 'index.html').write_bytes(self.data)
        (self.source / 'private-unlisted.txt').write_text('SYNTHETIC DO NOT COPY')
        self.output = self.root / 'output'
        self.manifest = {
            'schemaVersion': 1, 'publicationApproved': True,
            'reviewedBy': 'synthetic-test-only', 'reviewedAt': '2026-01-01T00:00:00Z',
            'requiredPaths': ['index.html'],
            'assets': [{'path': 'index.html', 'source': 'index.html',
                        'sha256': hashlib.sha256(self.data).hexdigest(), 'approved': True}],
        }

    def run_stage(self):
        manifest = self.root / 'manifest.json'
        manifest.write_text(json.dumps(self.manifest))
        return subprocess.run(['python3', str(SCRIPT), '--manifest', str(manifest),
                               '--source', str(self.source), '--destination', str(self.output)],
                              capture_output=True, text=True)

    def test_only_exact_approved_bytes_are_staged(self):
        result = self.run_stage()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.output / 'index.html').read_bytes(), self.data)
        self.assertEqual(sorted(p.name for p in self.output.iterdir()), ['index.html'])

    def rejected(self):
        result = self.run_stage()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.output.exists())

    def test_pending_release(self):
        self.manifest['publicationApproved'] = False
        self.rejected()

    def test_pending_asset(self):
        self.manifest['assets'][0]['approved'] = False
        self.rejected()

    def test_truthy_string_not_approval(self):
        self.manifest['assets'][0]['approved'] = 'true'
        self.rejected()

    def test_missing_reviewer(self):
        self.manifest['reviewedBy'] = ''
        self.rejected()

    def test_hash_mismatch(self):
        self.manifest['assets'][0]['sha256'] = '0' * 64
        self.rejected()

    def test_missing_lesson(self):
        self.manifest['requiredPaths'].append('media/required.mp4')
        self.rejected()

    def test_extra_asset(self):
        self.manifest['requiredPaths'] = []
        self.rejected()

    def test_duplicates(self):
        self.manifest['assets'] *= 2
        self.rejected()

    def test_source_symlink(self):
        (self.source / 'alias.html').symlink_to(self.source / 'index.html')
        self.manifest['assets'][0]['source'] = 'alias.html'
        self.rejected()

    def test_source_parent_symlink(self):
        (self.source / 'link').symlink_to(self.source, target_is_directory=True)
        self.manifest['assets'][0]['source'] = 'link/index.html'
        self.rejected()

    def test_unsafe_paths(self):
        for path in ['../escape.html', '/escape.html', 'docs/../escape.html',
                     'docs//escape.html', 'docs\\escape.html', '.env', 'docs/%2e.html']:
            with self.subTest(path=path):
                self.manifest['assets'][0]['path'] = path
                self.manifest['requiredPaths'] = [path]
                self.rejected()

    def test_source_traversal(self):
        self.manifest['assets'][0]['source'] = '../approved/index.html'
        self.rejected()

    def test_reject_unknown_fields(self):
        self.manifest['approved'] = True
        self.rejected()

    def test_existing_destination_is_never_merged(self):
        self.output.mkdir()
        marker = self.output / 'keep.txt'
        marker.write_text('keep')
        self.assertNotEqual(self.run_stage().returncode, 0)
        self.assertEqual(marker.read_text(), 'keep')
        self.assertFalse((self.output / 'index.html').exists())

    def test_late_failure_leaves_no_partial_release(self):
        self.manifest['requiredPaths'].append('docs/missing.html')
        self.manifest['assets'].append(dict(self.manifest['assets'][0],
                                          path='docs/missing.html', source='missing.html'))
        self.rejected()


if __name__ == '__main__':
    unittest.main()

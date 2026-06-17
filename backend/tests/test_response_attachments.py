"""Unit tests for response attachment collection in hermes_task_runner."""

import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

# Ensure the scripts directory is importable
_scripts_dir = str(Path(__file__).resolve().parents[1] / "hermeshq" / "scripts")
sys.path.insert(0, _scripts_dir)

import hermes_task_runner as runner


class TestSnapshotDirectory(unittest.TestCase):
    """Tests for _snapshot_directory()."""

    def test_nonexistent_directory(self) -> None:
        result = runner._snapshot_directory(Path("/nonexistent/path"))
        self.assertEqual(result, {})

    def test_empty_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            result = runner._snapshot_directory(Path(tmpdir))
            self.assertEqual(result, {})

    def test_files_captured(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            (tmp / "report.xlsx").write_bytes(b"fake xlsx")
            (tmp / "image.png").write_bytes(b"fake png")
            (tmp / "subdir").mkdir()
            (tmp / "subdir" / "data.csv").write_bytes(b"a,b,c")

            snapshot = runner._snapshot_directory(tmp)
            self.assertIn("report.xlsx", snapshot)
            self.assertIn("image.png", snapshot)
            self.assertIn("subdir/data.csv", snapshot)
            self.assertEqual(snapshot["report.xlsx"]["ext"], ".xlsx")
            self.assertEqual(snapshot["image.png"]["size"], 8)
            self.assertEqual(snapshot["report.xlsx"]["name"], "report.xlsx")


class TestDiffSnapshots(unittest.TestCase):
    """Tests for _diff_snapshots()."""

    def test_no_changes(self) -> None:
        pre = {"file.txt": {"path": "/x", "name": "file.txt", "ext": ".txt", "size": 10, "mtime": 1.0}}
        post = {"file.txt": {"path": "/x", "name": "file.txt", "ext": ".txt", "size": 10, "mtime": 1.0}}
        self.assertEqual(runner._diff_snapshots(pre, post), [])

    def test_new_file(self) -> None:
        pre = {}
        post = {"new.txt": {"path": "/x", "name": "new.txt", "ext": ".txt", "size": 5, "mtime": 2.0}}
        diff = runner._diff_snapshots(pre, post)
        self.assertEqual(len(diff), 1)
        self.assertEqual(diff[0]["name"], "new.txt")

    def test_modified_file_size(self) -> None:
        pre = {"f.txt": {"path": "/x", "name": "f.txt", "ext": ".txt", "size": 10, "mtime": 1.0}}
        post = {"f.txt": {"path": "/x", "name": "f.txt", "ext": ".txt", "size": 20, "mtime": 1.0}}
        diff = runner._diff_snapshots(pre, post)
        self.assertEqual(len(diff), 1)

    def test_modified_file_mtime(self) -> None:
        pre = {"f.txt": {"path": "/x", "name": "f.txt", "ext": ".txt", "size": 10, "mtime": 1.0}}
        post = {"f.txt": {"path": "/x", "name": "f.txt", "ext": ".txt", "size": 10, "mtime": 2.0}}
        diff = runner._diff_snapshots(pre, post)
        self.assertEqual(len(diff), 1)

    def test_deleted_file_not_in_diff(self) -> None:
        pre = {"old.txt": {"path": "/x", "name": "old.txt", "ext": ".txt", "size": 10, "mtime": 1.0}}
        post = {}
        diff = runner._diff_snapshots(pre, post)
        self.assertEqual(diff, [])


class TestCollectResponseAttachments(unittest.TestCase):
    """Tests for _collect_response_attachments()."""

    def test_no_new_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            (tmp / "work").mkdir()
            (tmp / "work" / "pre_existing.txt").write_bytes(b"old content")

            pre = runner._snapshot_directory(tmp / "work")
            attachments = runner._collect_response_attachments(tmp, pre)
            self.assertEqual(attachments, [])

    def test_new_file_collected_and_copied(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            (tmp / "work").mkdir()
            pre = runner._snapshot_directory(tmp / "work")

            # Simulate agent generating a file
            (tmp / "work" / "report.xlsx").write_bytes(b"fake xlsx content here")

            attachments = runner._collect_response_attachments(tmp, pre)
            self.assertEqual(len(attachments), 1)

            att = attachments[0]
            self.assertEqual(att["filename"], "report.xlsx")
            self.assertEqual(att["media_type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            self.assertGreater(att["size"], 0)
            self.assertIn("source_path", att)  # internal field
            self.assertNotIn("path", att)  # public path not included

            # Verify file was copied to uploads/
            uploads = tmp / "uploads"
            self.assertTrue(uploads.exists())
            copied_files = list(uploads.glob("*.xlsx"))
            self.assertEqual(len(copied_files), 1)
            self.assertEqual(copied_files[0].read_bytes(), b"fake xlsx content here")

    def test_disallowed_extension_filtered(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            (tmp / "work").mkdir()
            pre = runner._snapshot_directory(tmp / "work")

            # .exe is not in allowed extensions
            (tmp / "work" / "malware.exe").write_bytes(b"bad")
            (tmp / "work" / "good.pdf").write_bytes(b"good pdf")

            attachments = runner._collect_response_attachments(tmp, pre)
            filenames = [a["filename"] for a in attachments]
            self.assertIn("good.pdf", filenames)
            self.assertNotIn("malware.exe", filenames)

    def test_empty_file_filtered(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            (tmp / "work").mkdir()
            pre = runner._snapshot_directory(tmp / "work")

            (tmp / "work" / "empty.txt").write_bytes(b"")
            (tmp / "work" / "data.txt").write_bytes(b"data")

            attachments = runner._collect_response_attachments(tmp, pre)
            filenames = [a["filename"] for a in attachments]
            self.assertIn("data.txt", filenames)
            self.assertNotIn("empty.txt", filenames)

    def test_max_files_limit(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            (tmp / "work").mkdir()
            pre = runner._snapshot_directory(tmp / "work")

            # Generate more than MAX_RESPONSE_FILES
            original_max = runner.MAX_RESPONSE_FILES
            try:
                runner.MAX_RESPONSE_FILES = 3
                for i in range(10):
                    (tmp / "work" / f"file_{i}.txt").write_bytes(f"content {i}".encode())

                attachments = runner._collect_response_attachments(tmp, pre)
                self.assertEqual(len(attachments), 3)
            finally:
                runner.MAX_RESPONSE_FILES = original_max

    def test_file_in_subdirectory(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            (tmp / "work").mkdir()
            (tmp / "work" / "output").mkdir()
            pre = runner._snapshot_directory(tmp / "work")

            (tmp / "work" / "output" / "result.json").write_bytes(b'{"key": "value"}')

            attachments = runner._collect_response_attachments(tmp, pre)
            self.assertEqual(len(attachments), 1)
            self.assertEqual(attachments[0]["filename"], "result.json")
            self.assertEqual(attachments[0]["media_type"], "application/json")

    def test_oversized_file_filtered(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            (tmp / "work").mkdir()
            pre = runner._snapshot_directory(tmp / "work")

            original_max = runner.MAX_RESPONSE_FILE_SIZE
            try:
                runner.MAX_RESPONSE_FILE_SIZE = 10
                (tmp / "work" / "big.txt").write_bytes(b"x" * 100)

                attachments = runner._collect_response_attachments(tmp, pre)
                self.assertEqual(attachments, [])
            finally:
                runner.MAX_RESPONSE_FILE_SIZE = original_max

    def test_pre_existing_file_not_collected(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            (tmp / "work").mkdir()
            (tmp / "work" / "old.txt").write_bytes(b"old")

            pre = runner._snapshot_directory(tmp / "work")

            # Don't modify old.txt, only add a new file
            (tmp / "work" / "new.txt").write_bytes(b"new")

            attachments = runner._collect_response_attachments(tmp, pre)
            filenames = [a["filename"] for a in attachments]
            self.assertIn("new.txt", filenames)
            self.assertNotIn("old.txt", filenames)

    def test_uuid_format_file_id(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            (tmp / "work").mkdir()
            pre = runner._snapshot_directory(tmp / "work")

            (tmp / "work" / "test.txt").write_bytes(b"test")

            attachments = runner._collect_response_attachments(tmp, pre)
            self.assertEqual(len(attachments), 1)
            # file_id should be a UUID
            file_id = attachments[0]["file_id"]
            _uuid_re = __import__("re").compile(
                r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
                __import__("re").IGNORECASE,
            )
            self.assertTrue(_uuid_re.match(file_id), f"file_id {file_id} is not a valid UUID")


try:
    from hermeshq.services.hermes_runtime import RuntimeExecutionResult
    _HAS_HERMESHQ = True
except ImportError:
    _HAS_HERMESHQ = False


@unittest.skipUnless(_HAS_HERMESHQ, "hermeshq package not available (requires Docker/container)")
class TestRuntimeExecutionResult(unittest.TestCase):
    """Test that RuntimeExecutionResult has the new field."""

    def test_field_exists(self) -> None:
        result = RuntimeExecutionResult(
            final_response="test",
            messages=[],
            tool_calls=[],
            tokens_used=0,
            iterations=0,
            engine="test",
            response_attachments=[{"file_id": "abc", "filename": "test.txt"}],
        )
        self.assertEqual(result.response_attachments[0]["file_id"], "abc")

    def test_field_required(self) -> None:
        """dataclass requires all fields, so this should raise TypeError if missing."""
        with self.assertRaises(TypeError):
            RuntimeExecutionResult(  # type: ignore[call-arg]
                final_response="test",
                messages=[],
                tool_calls=[],
                tokens_used=0,
                iterations=0,
                engine="test",
            )


if __name__ == "__main__":
    unittest.main()

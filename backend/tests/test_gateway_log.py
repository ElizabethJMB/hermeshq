"""Tests for gateway log rotation and efficient tail reading."""

import tempfile
import unittest
from pathlib import Path

from hermeshq.services.gateway_process_manager import (
    GATEWAY_LOG_MAX_BYTES,
    GatewayProcessManager,
)


class TestRotateGatewayLog(unittest.TestCase):
    def test_rotates_when_over_cap(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "gateway.log"
            log.write_bytes(b"x" * (GATEWAY_LOG_MAX_BYTES + 1))
            GatewayProcessManager._rotate_gateway_log(log)
            self.assertFalse(log.exists())
            rotated = Path(tmp) / "gateway.log.1"
            self.assertTrue(rotated.exists())
            self.assertEqual(rotated.stat().st_size, GATEWAY_LOG_MAX_BYTES + 1)

    def test_no_rotation_under_cap(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "gateway.log"
            log.write_text("small log\n")
            GatewayProcessManager._rotate_gateway_log(log)
            self.assertTrue(log.exists())
            self.assertFalse((Path(tmp) / "gateway.log.1").exists())

    def test_missing_file_is_noop(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            GatewayProcessManager._rotate_gateway_log(Path(tmp) / "gateway.log")


class TestReadLogTail(unittest.TestCase):
    def test_returns_last_lines(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "gateway.log"
            log.write_text("\n".join(f"line-{i}" for i in range(200)))
            tail = GatewayProcessManager._read_log_tail(log, lines=10)
            result_lines = tail.splitlines()
            self.assertEqual(len(result_lines), 10)
            self.assertEqual(result_lines[-1], "line-199")
            self.assertEqual(result_lines[0], "line-190")

    def test_large_file_reads_only_tail(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "gateway.log"
            with log.open("w") as fh:
                for i in range(200_000):
                    fh.write(f"some log line number {i} with padding to make it longer\n")
            tail = GatewayProcessManager._read_log_tail(log, lines=5)
            result_lines = tail.splitlines()
            self.assertEqual(len(result_lines), 5)
            self.assertIn("199999", result_lines[-1])

    def test_missing_file_returns_empty(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(GatewayProcessManager._read_log_tail(Path(tmp) / "nope.log"), "")


if __name__ == "__main__":
    unittest.main()

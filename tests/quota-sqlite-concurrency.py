"""Offline SQLite concurrency checks against the EXACT SQL in backend/daily-quotas.js.

This is an isolated SQLite file in a GitHub runner. It never contacts Cloudflare
or OpenAI and does NOT prove D1's cloud-side transaction behavior.
"""
from __future__ import annotations

import concurrent.futures
import pathlib
import re
import sqlite3
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "backend" / "daily-quotas.js").read_text(encoding="utf-8")
MATCH = re.search(r"const\s+sql\s*=\s*`([^`]+)`", SOURCE)
if not MATCH:
    raise AssertionError("Could not find the quota helper's SQL literal")
QUOTA_SQL = MATCH.group(1)

SCHEMA = """CREATE TABLE usage_daily (
    day TEXT NOT NULL,
    owner TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('writing','speaking')),
    used INTEGER NOT NULL DEFAULT 0 CHECK(used >= 0),
    PRIMARY KEY(day,owner,kind)
)"""


class QuotaConcurrentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="english-plus-qa-")
        self.addCleanup(self.tmp.cleanup)
        self.db = pathlib.Path(self.tmp.name) / "local-quota-only.sqlite"
        with sqlite3.connect(self.db, timeout=15.0) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute(SCHEMA)

    def consume(self, day: str, owner: str, kind: str, limit: int):
        with sqlite3.connect(self.db, timeout=15.0, isolation_level=None) as conn:
            conn.execute("PRAGMA busy_timeout=15000")
            row = conn.execute(QUOTA_SQL, (day, owner, kind, limit)).fetchone()
            return row[0] if row else None

    def count(self, day: str, owner: str, kind: str):
        with sqlite3.connect(self.db, timeout=15.0) as conn:
            row = conn.execute(
                "SELECT used FROM usage_daily WHERE day=? AND owner=? AND kind=?",
                (day, owner, kind),
            ).fetchone()
            return row[0] if row else 0

    def concurrent(self, day: str, owner: str, kind: str, limit: int, attempts: int):
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(attempts, 24)) as pool:
            work = [pool.submit(self.consume, day, owner, kind, limit) for _ in range(attempts)]
            return [future.result(timeout=30) for future in work]

    def test_writing_race_cannot_reserve_more_than_ten(self):
        values = self.concurrent("2026-10-25", "synthetic-owner-one", "writing", 10, 40)
        accepted = [v for v in values if v is not None]
        self.assertEqual(len(accepted), 10)
        self.assertEqual(sorted(accepted), list(range(1, 11)))
        self.assertEqual(self.count("2026-10-25", "synthetic-owner-one", "writing"), 10)

    def test_speaking_race_cannot_reserve_more_than_three(self):
        values = self.concurrent("2026-10-25", "synthetic-owner-one", "speaking", 3, 30)
        accepted = [v for v in values if v is not None]
        self.assertEqual(sorted(accepted), [1, 2, 3])
        self.assertEqual(self.count("2026-10-25", "synthetic-owner-one", "speaking"), 3)

    def test_owners_are_isolated_under_contention(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=24) as pool:
            tasks = [
                pool.submit(self.consume, "2026-10-25", f"synthetic-owner-{n%2}", "writing", 10)
                for n in range(50)
            ]
            accepted = [t.result(timeout=30) for t in tasks]
        self.assertEqual(sum(x is not None for x in accepted), 20)
        self.assertEqual(self.count("2026-10-25", "synthetic-owner-0", "writing"), 10)
        self.assertEqual(self.count("2026-10-25", "synthetic-owner-1", "writing"), 10)

    def test_next_utc_day_resets_only_that_days_reservations(self):
        a = self.concurrent("2026-10-25", "synthetic-owner-one", "writing", 10, 24)
        b = self.concurrent("2026-10-26", "synthetic-owner-one", "writing", 10, 24)
        self.assertEqual(sum(v is not None for v in a), 10)
        self.assertEqual(sum(v is not None for v in b), 10)
        self.assertEqual(self.count("2026-10-25", "synthetic-owner-one", "writing"), 10)
        self.assertEqual(self.count("2026-10-26", "synthetic-owner-one", "writing"), 10)

    def test_sql_exact_source_and_no_external_identifiers(self):
        self.assertIn("ON CONFLICT(day,owner,kind)", QUOTA_SQL)
        self.assertIn("WHERE used < ?4 RETURNING used", QUOTA_SQL)
        with sqlite3.connect(self.db) as conn:
            columns = [r[1] for r in conn.execute("PRAGMA table_info(usage_daily)")]
        self.assertEqual(columns, ["day", "owner", "kind", "used"])
        self.assertNotIn("draft", SCHEMA)
        self.assertNotIn("email", SCHEMA)
        self.assertNotIn("api_key", SCHEMA)


if __name__ == "__main__":
    unittest.main(verbosity=2)

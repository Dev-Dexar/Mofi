"""Shared test setup: no network and no real database. Everything the money code talks to is replaced by in-memory stand-ins."""
from __future__ import annotations

import os
import sys
from pathlib import Path

# set before anything imports the app's settings (a dummy project: nothing here ever reaches it)
os.environ["SUPABASE_URL"] = "https://test.supabase.co"
os.environ["SUPABASE_SERVICE_KEY"] = "test.service.key"
for name in ("NOWPAYMENTS_EMAIL", "NOWPAYMENTS_PASSWORD", "NOWPAYMENTS_2FA_SECRET", "WITHDRAW_CONVERSION_FEE_PCT"):
    os.environ.pop(name, None)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


class FakeQuery:
    """Just enough of the Supabase query builder for the code under test, over a list of dict rows."""

    def __init__(self, rows: list[dict]):
        self.rows = rows
        self.filters = []
        self.patch = None
        self._negate = False

    def select(self, *_a, **_k):
        return self

    def update(self, patch):
        self.patch = patch
        return self

    @property
    def not_(self):
        self._negate = True
        return self

    def eq(self, col, val):
        self.filters.append(lambda r: r.get(col) == val)
        return self

    def neq(self, col, val):
        self.filters.append(lambda r: r.get(col) != val)
        return self

    def is_(self, col, _val):
        negate, self._negate = self._negate, False
        self.filters.append((lambda r: r.get(col) is not None) if negate else (lambda r: r.get(col) is None))
        return self

    def lt(self, col, val):
        self.filters.append(lambda r: r.get(col) is not None and str(r.get(col)) < val)
        return self

    def limit(self, _n):
        return self

    def execute(self):
        matched = [r for r in self.rows if all(f(r) for f in self.filters)]
        if self.patch is not None:
            for r in matched:
                r.update(self.patch)
        out = type("Result", (), {})()
        out.data = [dict(r) for r in matched]
        return out


class FakeDB:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}

    def rows(self, table: str) -> list[dict]:
        return self.tables.setdefault(table, [])

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self.rows(name))

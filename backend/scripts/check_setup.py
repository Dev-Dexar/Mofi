"""
Checks the whole installation against the real services and tells you, in plain words, what is missing and how to fix it.

    cd backend
    .venv/bin/python -m scripts.check_setup

Changes nothing. Exit code 1 if anything failed (so it can run in a deploy script).
"""
import asyncio
import sys

from core.diagnostics import format_report, run_checks


def main() -> int:
    checks = asyncio.run(run_checks())
    print(format_report(checks))
    return 1 if any(c.status == "fail" for c in checks) else 0


if __name__ == "__main__":
    sys.exit(main())

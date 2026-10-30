from __future__ import annotations
import re
from decimal import Decimal, InvalidOperation
from typing import Any

# Plain ASCII numbers only. Decimal() on its own also takes "NaN", "Infinity", "1_000" and digits of other scripts.
_PLAIN_NUMBER = re.compile(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?", re.ASCII)


def finite_decimal(value: Any) -> Decimal:
    """A real, finite number from JSON input (number or plain numeric string), else ValueError."""
    if isinstance(value, bool) or value is None:
        raise ValueError("Invalid amount")
    if isinstance(value, str):
        value = value.strip()
        if not _PLAIN_NUMBER.fullmatch(value):
            raise ValueError("Invalid amount")
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValueError("Invalid amount")
    if not number.is_finite():
        raise ValueError("Invalid amount")
    return number


def whole_cents(value: Any) -> Decimal:
    """However it was written (50.100, 5E1), exactly two places: 50.10, 50.00."""
    try:
        return finite_decimal(value).quantize(Decimal("0.01"))
    except InvalidOperation:
        raise ValueError("Invalid amount")

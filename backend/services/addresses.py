"""
Withdrawal address checks, one per coin.

A format check alone lets a mistyped address through, and a crypto payout cannot be taken back. So on top of the shape of the
address, each coin's own checksum is verified (the checks that wallets and exchanges apply themselves):

  BTC          Base58Check for 1… / 3… addresses, Bech32 / Bech32m for bc1… addresses
  ETH, BEP-20  0x + 40 hex; an address with mixed upper and lower case must match its EIP-55 checksum
  SOL          Base58 that decodes to exactly 32 bytes
  TON          friendly form (EQ… / UQ…) with its CRC16, mainnet only, or the raw form 0:<64 hex>

`address_error(coin, address)` returns None when the address is fine, otherwise a sentence fit to show the user.
Pure Python and standard library only.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import re

_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_B58_INDEX = {c: i for i, c in enumerate(_B58)}


def _b58decode(s: str) -> bytes | None:
    n = 0
    for ch in s:
        if ch not in _B58_INDEX:
            return None
        n = n * 58 + _B58_INDEX[ch]
    body = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
    return b"\x00" * (len(s) - len(s.lstrip("1"))) + body


# ----------------------------------------------------------------------------- Keccak-256 (EIP-55 needs it; hashlib's sha3 is not it)
_M64 = (1 << 64) - 1
_RC = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000, 0x000000000000808B,
    0x0000000080000001, 0x8000000080008081, 0x8000000000008009, 0x000000000000008A, 0x0000000000000088,
    0x0000000080008009, 0x000000008000000A, 0x000000008000808B, 0x800000000000008B, 0x8000000000008089,
    0x8000000000008003, 0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
]
_ROT = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]]


def _rol(v: int, n: int) -> int:
    n %= 64
    return ((v << n) | (v >> (64 - n))) & _M64 if n else v


def _keccak_f(a: list[list[int]]) -> list[list[int]]:
    for rnd in range(24):
        c = [a[x][0] ^ a[x][1] ^ a[x][2] ^ a[x][3] ^ a[x][4] for x in range(5)]
        d = [c[(x - 1) % 5] ^ _rol(c[(x + 1) % 5], 1) for x in range(5)]
        a = [[a[x][y] ^ d[x] for y in range(5)] for x in range(5)]
        b = [[0] * 5 for _ in range(5)]
        for x in range(5):
            for y in range(5):
                b[y][(2 * x + 3 * y) % 5] = _rol(a[x][y], _ROT[x][y])
        a = [[b[x][y] ^ ((~b[(x + 1) % 5][y]) & b[(x + 2) % 5][y]) & _M64 for y in range(5)] for x in range(5)]
        a[0][0] ^= _RC[rnd]
    return a


def keccak256(data: bytes) -> bytes:
    rate = 136
    padded = bytearray(data) + b"\x01"
    padded += b"\x00" * (-len(padded) % rate)
    padded[-1] |= 0x80
    a = [[0] * 5 for _ in range(5)]
    for off in range(0, len(padded), rate):
        for i in range(rate // 8):
            a[i % 5][i // 5] ^= int.from_bytes(padded[off + 8 * i: off + 8 * i + 8], "little")
        a = _keccak_f(a)
    out = b"".join(a[i % 5][i // 5].to_bytes(8, "little") for i in range(4))
    return out


# ----------------------------------------------------------------------------- Bech32 / Bech32m (BIP-173 / BIP-350)
_BECH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


def _polymod(values: list[int]) -> int:
    gen = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]
    chk = 1
    for v in values:
        top = chk >> 25
        chk = (chk & 0x1FFFFFF) << 5 ^ v
        for i in range(5):
            chk ^= gen[i] if (top >> i) & 1 else 0
    return chk


def _segwit_ok(addr: str) -> bool:
    if addr != addr.lower() or not (14 <= len(addr) <= 90):
        return False
    pos = addr.rfind("1")
    hrp, data_part = addr[:pos], addr[pos + 1:]
    if hrp != "bc" or len(data_part) < 7 or any(ch not in _BECH for ch in data_part):
        return False
    data = [_BECH.index(ch) for ch in data_part]
    const = _polymod([ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp] + data)
    version, prog5 = data[0], data[1:-6]
    if version > 16 or const != (1 if version == 0 else 0x2BC830A3):
        return False
    acc = bits = 0
    program = []
    for v in prog5:  # 5-bit groups back into bytes, with no leftover padding bits
        acc = (acc << 5) | v
        bits += 5
        while bits >= 8:
            bits -= 8
            program.append((acc >> bits) & 0xFF)
    if bits >= 5 or (acc & ((1 << bits) - 1)):  # leftover padding bits must be fewer than 5 and all zero
        return False
    if not (2 <= len(program) <= 40):
        return False
    return len(program) in (20, 32) if version == 0 else True


# ----------------------------------------------------------------------------- per coin
def _A(name: str) -> str:
    return "an" if name[0] in "AEIOU" else "a"


def _btc(addr: str) -> str | None:
    msg = "Not a Bitcoin address. It should start with bc1, 1 or 3."
    if addr.startswith("bc1"):
        return None if _segwit_ok(addr) else "Not a Bitcoin address: the check characters do not match. Check for a typo."
    raw = _b58decode(addr)
    if raw is None or len(raw) != 25 or raw[0] not in (0x00, 0x05):
        return msg
    if hashlib.sha256(hashlib.sha256(raw[:-4]).digest()).digest()[:4] != raw[-4:]:
        return "Not a Bitcoin address: the check characters do not match. Check for a typo."
    if (raw[0] == 0x00) != addr.startswith("1"):
        return msg
    return None


def _evm(addr: str, name: str) -> str | None:
    msg = f"Not {_A(name)} {name} address. It should start with 0x and be 42 characters."
    if not re.fullmatch(r"0x[0-9a-fA-F]{40}", addr):
        return msg
    body = addr[2:]
    if int(body, 16) == 0:
        return "That address cannot receive funds. Enter your own address."
    if body != body.lower() and body != body.upper():  # mixed case carries the EIP-55 checksum
        digest = keccak256(body.lower().encode()).hex()
        expected = "".join(ch.upper() if int(digest[i], 16) >= 8 else ch for i, ch in enumerate(body.lower()))
        if body != expected:
            return "The checksum does not match. Check for a typo, or copy the address again."
    return None


def _sol(addr: str) -> str | None:
    raw = _b58decode(addr) if re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]{32,44}", addr) else None
    if raw is None or len(raw) != 32:
        return "Not a Solana address. It should be 32 to 44 characters."
    return None


def _crc16_xmodem(data: bytes) -> int:
    crc = 0
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def _ton(addr: str) -> str | None:
    msg = "Not a TON address. It should start with EQ or UQ and be 48 characters."
    if re.fullmatch(r"0:[0-9a-fA-F]{64}", addr):
        return None
    if not re.fullmatch(r"[A-Za-z0-9_-]{48}", addr):
        return msg
    try:
        raw = base64.urlsafe_b64decode(addr)
    except (binascii.Error, ValueError):
        return msg
    if len(raw) != 36 or raw[0] not in (0x11, 0x51) or raw[1] not in (0x00, 0xFF):
        return msg
    if _crc16_xmodem(raw[:34]) != int.from_bytes(raw[34:], "big"):
        return "Not a TON address: the check characters do not match. Check for a typo."
    return None


def address_error(coin: str, address: str) -> str | None:
    """None if `address` is a good receiving address for `coin`, otherwise what to tell the user."""
    if not address or address != address.strip() or not address.isascii():
        return "Remove the spaces or odd characters from the address."
    if coin == "btc":
        return _btc(address)
    if coin == "eth":
        return _evm(address, "Ethereum")
    if coin == "usdtbsc":
        return _evm(address, "BNB Chain (BEP-20)")
    if coin == "sol":
        return _sol(address)
    if coin == "ton":
        return _ton(address)
    return "Unsupported coin."

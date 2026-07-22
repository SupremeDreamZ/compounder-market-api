#!/usr/bin/env python3
"""Token-free transition watchdog for Compounder Market API and its Base wallet.

Normal scheduled runs are silent. Output is emitted only on a state transition,
balance change, catalog appearance, or when --report is supplied.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE_URL = os.environ.get("COMPOUNDER_BASE_URL", "https://compounder-market-api.vercel.app").rstrip("/")
RPC_URL = os.environ.get("BASE_RPC_URL", "https://mainnet.base.org")
CATALOG_URL = os.environ.get(
    "X402_CATALOG_URL", "https://facilitator.payai.network/discovery/resources?limit=100&offset=0"
)
WALLET = "0xc7A7563793C3aeaCA9177a4aa2e4fd7C01F7Eb35"
USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
AUSDC = "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB"
AAVE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"
NETWORK = "eip155:8453"
PRICE_ATOMIC = "10000"
RESOURCE_URL = f"{BASE_URL}/api/bounty-score"
STATE_DEFAULT = Path(__file__).resolve().parents[1] / ".state" / "compounder-watchdog.json"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def http_json(url: str, *, method: str = "GET", body: dict[str, Any] | None = None) -> tuple[int, Any, Any]:
    data = json.dumps(body).encode() if body is not None else None
    request = Request(
        url,
        data=data,
        method=method,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=25) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None, response.headers
    except HTTPError as error:
        raw = error.read()
        parsed = None
        if raw:
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                parsed = raw.decode(errors="replace")
        return error.code, parsed, error.headers


def rpc(method: str, params: list[Any]) -> str:
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    request = Request(
        RPC_URL,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "compounder-watchdog/1.0"},
        method="POST",
    )
    with urlopen(request, timeout=25) as response:
        result = json.loads(response.read())
    if "error" in result:
        raise RuntimeError(f"RPC {method}: {result['error']}")
    return result["result"]


def address_word(address: str) -> str:
    return address.lower().removeprefix("0x").rjust(64, "0")


def token_balance(token: str, owner: str) -> Decimal:
    data = "0x70a08231" + address_word(owner)
    raw = rpc("eth_call", [{"to": token, "data": data}, "latest"])
    return Decimal(int(raw, 16)) / Decimal(10**6)


def token_allowance(token: str, owner: str, spender: str) -> Decimal:
    data = "0xdd62ed3e" + address_word(owner) + address_word(spender)
    raw = rpc("eth_call", [{"to": token, "data": data}, "latest"])
    return Decimal(int(raw, 16)) / Decimal(10**6)


def decode_payment_header(value: str) -> dict[str, Any]:
    normalized = value.replace("-", "+").replace("_", "/")
    normalized += "=" * ((4 - len(normalized) % 4) % 4)
    return json.loads(base64.b64decode(normalized))


def verify_service() -> dict[str, Any]:
    status, health, _ = http_json(f"{BASE_URL}/api/health")
    if status != 200 or not isinstance(health, dict) or health.get("ok") is not True:
        raise RuntimeError(f"health check returned HTTP {status}")
    if health.get("network") != NETWORK:
        raise RuntimeError(f"health network changed to {health.get('network')}")
    if str(health.get("payTo", "")).lower() != WALLET.lower():
        raise RuntimeError("health payee changed")

    status, docs, _ = http_json(f"{BASE_URL}/api/bounty-score")
    if status != 200 or not isinstance(docs, dict) or docs.get("price") != "$0.01 USDC":
        raise RuntimeError(f"free endpoint docs are invalid (HTTP {status})")

    status, _, headers = http_json(
        f"{BASE_URL}/api/bounty-score",
        method="POST",
        body={"payoutUsd": 250, "hoursEstimate": 4, "daysToDeadline": 5},
    )
    if status != 402:
        raise RuntimeError(f"unpaid POST returned HTTP {status}, expected 402")
    encoded = headers.get("Payment-Required")
    if not encoded:
        raise RuntimeError("Payment-Required header missing")
    requirement = decode_payment_header(encoded)
    options = requirement.get("accepts", [])
    accept = next(
        (
            option
            for option in options
            if option.get("network") == NETWORK and option.get("scheme") == "exact"
        ),
        None,
    )
    if not accept:
        raise RuntimeError("exact Base payment option missing")
    if str(accept.get("amount")) != PRICE_ATOMIC:
        raise RuntimeError(f"payment amount changed to {accept.get('amount')}")
    if str(accept.get("asset", "")).lower() != USDC.lower():
        raise RuntimeError("payment asset changed")
    if str(accept.get("payTo", "")).lower() != WALLET.lower():
        raise RuntimeError("payment recipient changed")
    resource = requirement.get("resource", {})
    if resource.get("url") != RESOURCE_URL:
        raise RuntimeError(f"resource URL changed to {resource.get('url')}")
    bazaar = requirement.get("extensions", {}).get("bazaar", {})
    input_info = bazaar.get("info", {}).get("input", {})
    methods = (
        bazaar.get("schema", {})
        .get("properties", {})
        .get("input", {})
        .get("properties", {})
        .get("method", {})
        .get("enum", [])
    )
    if input_info.get("bodyType") != "json" or "POST" not in methods:
        raise RuntimeError("Bazaar POST JSON metadata is invalid")
    return {
        "status": "healthy",
        "x402Version": requirement.get("x402Version"),
        "bodyFieldCount": len(input_info.get("body", {})),
    }


def wallet_snapshot() -> dict[str, Any]:
    eth = Decimal(int(rpc("eth_getBalance", [WALLET, "latest"]), 16)) / Decimal(10**18)
    nonce = int(rpc("eth_getTransactionCount", [WALLET, "latest"]), 16)
    usdc = token_balance(USDC, WALLET)
    ausdc = token_balance(AUSDC, WALLET)
    allowance = token_allowance(USDC, WALLET, AAVE_POOL)
    return {
        "eth": str(eth),
        "usdc": str(usdc),
        "aUsdc": str(ausdc),
        "aaveAllowance": str(allowance),
        "nonce": nonce,
    }


def catalog_snapshot() -> dict[str, Any]:
    status, payload, _ = http_json(CATALOG_URL)
    if status != 200 or not isinstance(payload, dict):
        raise RuntimeError(f"catalog returned HTTP {status}")
    items = payload.get("items", [])
    hit = next((item for item in items if item.get("resource") == RESOURCE_URL), None)
    return {
        "listed": hit is not None,
        "firstPageItems": len(items),
        "totalItems": payload.get("pagination", {}).get("total"),
        "lastUpdated": hit.get("lastUpdated") if hit else None,
        "note": "PayAI is newest-first; the first 100 entries cover the launch-window detector.",
    }


def load_state(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False) as handle:
        json.dump(state, handle, indent=2, sort_keys=True)
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", action="store_true", help="always print the full current status")
    parser.add_argument("--state", type=Path, default=STATE_DEFAULT)
    args = parser.parse_args()

    previous = load_state(args.state)
    checked_at = utc_now()
    issues: list[str] = []
    warnings: list[str] = []
    service: dict[str, Any] | None = None
    wallet: dict[str, Any] | None = None
    catalog: dict[str, Any] | None = None

    try:
        service = verify_service()
    except (RuntimeError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as error:
        issues.append(f"service: {error}")

    try:
        wallet = wallet_snapshot()
        if Decimal(wallet["eth"]) < Decimal("0.0005"):
            issues.append(f"wallet gas low: {wallet['eth']} ETH")
        if Decimal(wallet["aUsdc"]) < Decimal("9.9"):
            issues.append(f"Aave reserve below floor: {wallet['aUsdc']} aUSDC")
        if Decimal(wallet["aaveAllowance"]) != 0:
            issues.append(f"unexpected Aave USDC allowance: {wallet['aaveAllowance']} USDC")
    except (RuntimeError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as error:
        issues.append(f"wallet RPC: {error}")

    try:
        catalog = catalog_snapshot()
    except (RuntimeError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as error:
        warnings.append(f"catalog: {error}")
        catalog = {
            "listed": (previous.get("catalog") or {}).get("listed"),
            "error": str(error),
        }

    status = "unhealthy" if issues else "healthy"
    messages: list[str] = []
    old_status = previous.get("status")
    old_issues = previous.get("issues", [])

    if old_status is not None and status != old_status:
        if status == "healthy":
            messages.append(f"✅ Compounder watchdog recovered at {checked_at}.")
        else:
            messages.append(f"🚨 Compounder watchdog became unhealthy at {checked_at}: " + "; ".join(issues))
    elif status == "unhealthy" and old_issues != issues:
        messages.append(f"🚨 Compounder watchdog issue changed at {checked_at}: " + "; ".join(issues))

    old_wallet = previous.get("wallet") or {}
    if wallet and "usdc" in old_wallet:
        delta = Decimal(wallet["usdc"]) - Decimal(old_wallet["usdc"])
        if delta > Decimal("0.000001"):
            messages.append(
                f"💵 Compounder wallet liquid USDC increased by {delta} to {wallet['usdc']} at {checked_at} "
                "(possible external revenue or funding; reconcile onchain before classifying)."
            )
        elif delta < Decimal("-0.000001"):
            messages.append(
                f"ℹ️ Compounder wallet liquid USDC decreased by {-delta} to {wallet['usdc']} at {checked_at}."
            )

    old_catalog = (previous.get("catalog") or {}).get("listed")
    if catalog and catalog["listed"] and old_catalog is not True:
        messages.append(f"🔎 Compounder Market API appeared in the PayAI Bazaar catalog at {checked_at}.")

    current = {
        "checkedAt": checked_at,
        "status": status,
        "issues": issues,
        "warnings": warnings,
        "service": service,
        "wallet": wallet,
        "catalog": catalog,
    }
    save_state(args.state, current)

    if args.report:
        print(json.dumps(current, indent=2, sort_keys=True))
    elif messages:
        print("\n".join(messages))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # A broken watchdog must never fail silently.
        print(f"🚨 Compounder watchdog internal failure: {error}", file=sys.stderr)
        raise

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
_rpc_override = os.environ.get("BASE_RPC_URLS") or os.environ.get("BASE_RPC_URL")
RPC_URLS = (
    [url.strip() for url in _rpc_override.split(",") if url.strip()]
    if _rpc_override
    else [
        "https://mainnet.base.org",
        "https://base-rpc.publicnode.com",
        "https://1rpc.io/base",
    ]
)
LAST_RPC_URL: str | None = None
CATALOG_URL = os.environ.get(
    "X402_CATALOG_URL", "https://facilitator.payai.network/discovery/resources?limit=100&offset=0"
)
AGENT_BOUNTIES_READY_URL = os.environ.get(
    "AGENT_BOUNTIES_READY_URL",
    "https://api.agentbounties.app/v1/opportunities"
    "?network=base-mainnet&view=ready_to_earn&source_type=canonical_base&limit=300",
)
AGENT_BOUNTIES_FEED_URL = os.environ.get(
    "AGENT_BOUNTIES_FEED_URL",
    "https://api.agentbounties.app/v1/base/autonomous-bounties/feed?network=base-mainnet",
)
MERGEPAY_SEARCH_URL = os.environ.get(
    "MERGEPAY_SEARCH_URL",
    "https://api.github.com/search/issues"
    "?q=%22MergePay%20bounty%22%20state%3Aopen&per_page=50",
)
SUPERTEAM_REGISTRATION = Path(
    os.environ.get(
        "SUPERTEAM_REGISTRATION",
        str(Path.home() / ".hermes/profiles/compounder/secrets/superteam/registration.json"),
    )
)
SUPERTEAM_LISTINGS_URL = os.environ.get(
    "SUPERTEAM_LISTINGS_URL", "https://superteam.fun/api/agents/listings/live?take=100"
)
MOLTJOBS_JOBS_URL = os.environ.get(
    "MOLTJOBS_JOBS_URL", "https://api.moltjobs.io/v1/jobs?status=OPEN&limit=50"
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


def http_json(
    url: str,
    *,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, Any, Any]:
    data = json.dumps(body).encode() if body is not None else None
    request_headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "compounder-watchdog/1.0",
    }
    if headers:
        request_headers.update(headers)
    request = Request(
        url,
        data=data,
        method=method,
        headers=request_headers,
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
    global LAST_RPC_URL
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    errors: list[str] = []
    for rpc_url in RPC_URLS:
        request = Request(
            rpc_url,
            data=payload,
            headers={"Content-Type": "application/json", "User-Agent": "compounder-watchdog/1.0"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=25) as response:
                result = json.loads(response.read())
            if "error" in result:
                raise RuntimeError(str(result["error"]))
            LAST_RPC_URL = rpc_url
            return result["result"]
        except (HTTPError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError, RuntimeError) as error:
            errors.append(f"{rpc_url}: {error}")
    raise RuntimeError(f"all Base RPC endpoints failed for {method}: " + " | ".join(errors))


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
    chain_id = int(rpc("eth_chainId", []), 16)
    if chain_id != 8453:
        raise RuntimeError(f"unexpected chain ID: {chain_id}")
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
        "chainId": chain_id,
        "rpcUrl": LAST_RPC_URL,
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


def agent_bounties_snapshot() -> dict[str, Any]:
    """Read-only snapshot of the canonical Base bounty rail (agentbounties.app).

    "Actionable" means a canonical item that is claimable AND verification-ready
    per the venue's own fields. This check never signs, claims, or posts a bond;
    a claim still requires a wallet bond and the mission capital-policy check.
    """
    status, ready, _ = http_json(AGENT_BOUNTIES_READY_URL)
    if status != 200 or not isinstance(ready, dict):
        raise RuntimeError(f"ready feed returned HTTP {status}")
    ready_items: list[dict[str, Any]] = []
    for item in ready.get("items", []):
        if not isinstance(item, dict):
            continue
        ready_items.append(
            {
                "id": item.get("opportunity_id") or item.get("source_id"),
                "title": item.get("title"),
            }
        )

    status, feed, _ = http_json(AGENT_BOUNTIES_FEED_URL)
    if status != 200 or not isinstance(feed, list):
        raise RuntimeError(f"canonical feed returned HTTP {status}")

    counts: dict[str, int] = {}
    item_status: dict[str, str] = {}
    actionable: list[dict[str, Any]] = []
    for item in feed:
        if not isinstance(item, dict):
            continue
        state = str(item.get("status"))
        counts[state] = counts.get(state, 0) + 1
        bounty_id = str(item.get("bounty_id"))
        item_status[bounty_id] = state
        if state == "claimable" and item.get("verification_ready") is True:
            document = (item.get("terms") or {}).get("document") or {}
            actionable.append(
                {
                    "id": bounty_id,
                    "title": document.get("title"),
                    "rewardAtomic": item.get("solver_reward"),
                    "bondAtomic": item.get("claim_bond"),
                }
            )
    return {
        "readyToEarn": ready_items,
        "actionable": actionable,
        "counts": counts,
        "itemStatus": item_status,
    }


def mergepay_snapshot() -> dict[str, Any]:
    """Read-only snapshot of open MergePay-funded GitHub issues (mergepay.fun).

    MergePay escrows USDC on Arc against a GitHub issue; a contributor comments
    /claim, opens a PR that says "Fixes #N", and the GitHub-signed merge proof
    releases the payout to the claimant's linked wallet. This check never
    comments, claims, or spends: it only detects newly funded issues so a later
    operator run can verify claim state and act before/while the swarm arrives.
    """
    status, payload, _ = http_json(MERGEPAY_SEARCH_URL)
    if status != 200 or not isinstance(payload, dict):
        raise RuntimeError(f"GitHub search returned HTTP {status}")
    items: list[dict[str, Any]] = []
    for item in payload.get("items", []):
        if not isinstance(item, dict):
            continue
        if "pull_request" in item:
            continue  # funded issues only; PRs can mention MergePay but are not claimable work
        repository_url = str(item.get("repository_url") or "").rstrip("/")
        parts = repository_url.split("/")
        repo = "/".join(parts[-2:]) if len(parts) >= 2 else repository_url
        items.append(
            {
                "id": f"{repo}#{item.get('number')}",
                "title": item.get("title"),
                "url": item.get("html_url"),
                "assignees": len(item.get("assignees") or []),
                "createdAt": item.get("created_at"),
            }
        )
    return {"open": items}


def superteam_snapshot() -> dict[str, Any]:
    """Read-only snapshot of agent-eligible Superteam Earn listings (superteam.fun).

    Uses the local agent registration created 2026-09-11 (apiKey + claimCode); the
    key is read from SUPERTEAM_REGISTRATION (default: the active Hermes profile's
    secrets directory) and is never printed, logged, or stored in the watch state.
    A machine without the registration skips this check with a warning instead of
    failing. This check never submits, comments, or claims.
    """
    try:
        registration = json.loads(SUPERTEAM_REGISTRATION.read_text())
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        raise RuntimeError(f"no readable registration at {SUPERTEAM_REGISTRATION}")
    api_key = registration.get("apiKey") if isinstance(registration, dict) else None
    if not api_key:
        raise RuntimeError("registration file has no apiKey")
    status, payload, _ = http_json(
        SUPERTEAM_LISTINGS_URL, headers={"Authorization": f"Bearer {api_key}"}
    )
    if status != 200:
        raise RuntimeError(f"Superteam listings returned HTTP {status}")
    if isinstance(payload, dict):
        items = payload.get("data") or payload.get("listings") or []
    elif isinstance(payload, list):
        items = payload
    else:
        items = []
    listings: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        listings.append(
            {
                "slug": item.get("slug"),
                "title": item.get("title"),
                "rewardAmount": item.get("rewardAmount"),
                "token": item.get("token"),
                "deadline": item.get("deadline"),
                "type": item.get("type"),
                "agentAccess": item.get("agentAccess"),
            }
        )
    return {"open": listings}


def moltjobs_snapshot() -> dict[str, Any]:
    """Read-only snapshot of OPEN jobs on MoltJobs (agent marketplace, USDC on Base).

    Public endpoint, no credentials. The board is thin and mostly platform
    referral/marketing slots; detect NEW open jobs so a later operator run can
    judge fit (customer jobs can be bid on once an agent is registered; referral
    slots need a genuinely different owner and must never be self-referred).
    """
    status, payload, _ = http_json(MOLTJOBS_JOBS_URL)
    if status != 200 or not isinstance(payload, dict):
        raise RuntimeError(f"MoltJobs returned HTTP {status}")
    jobs: list[dict[str, Any]] = []
    for item in payload.get("data", []):
        if not isinstance(item, dict):
            continue
        jobs.append(
            {
                "id": item.get("id"),
                "title": item.get("title"),
                "purpose": item.get("purpose"),
                "budgetUsdc": item.get("budgetUsdc"),
                "createdAt": item.get("createdAt"),
            }
        )
    return {"open": jobs}


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
    agent_bounties: dict[str, Any] | None = None
    mergepay: dict[str, Any] | None = None
    superteam: dict[str, Any] | None = None
    moltjobs: dict[str, Any] | None = None

    try:
        service = verify_service()
    except (RuntimeError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as error:
        issues.append(f"service: {error}")

    try:
        wallet = wallet_snapshot()
        if Decimal(wallet["eth"]) < Decimal("0.0005"):
            issues.append(f"wallet gas low: {wallet['eth']} ETH")
        if Decimal(wallet["aUsdc"]) < Decimal("9.9"):
            # Quantize the reported figure to 0.01 aUSDC: aUSDC accrues continuously, so the raw
            # value drifts every run and re-fires the "issue changed" message even when nothing
            # actionable happened. 0.01 granularity still re-fires on any material change.
            reserve_display = Decimal(wallet["aUsdc"]).quantize(Decimal("0.01"))
            issues.append(f"Aave reserve below floor: {reserve_display} aUSDC")
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

    try:
        agent_bounties = agent_bounties_snapshot()
    except (RuntimeError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as error:
        warnings.append(f"agent bounties: {error}")
        agent_bounties = None

    try:
        mergepay = mergepay_snapshot()
    except (RuntimeError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as error:
        warnings.append(f"mergepay: {error}")
        mergepay = None

    try:
        superteam = superteam_snapshot()
    except (RuntimeError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as error:
        warnings.append(f"superteam: {error}")
        superteam = None

    try:
        moltjobs = moltjobs_snapshot()
    except (RuntimeError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as error:
        warnings.append(f"moltjobs: {error}")
        moltjobs = None

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

    old_agent_bounties = previous.get("agentBounties") or {}
    if agent_bounties is not None and old_agent_bounties:
        old_actionable_ids = {
            entry.get("id") for entry in old_agent_bounties.get("actionable", [])
        }
        appeared = [
            entry
            for entry in agent_bounties["actionable"]
            if entry.get("id") not in old_actionable_ids
        ]
        show = appeared or (
            agent_bounties["readyToEarn"] if not old_agent_bounties.get("readyToEarn") else []
        )
        if show:
            listing = "; ".join(
                f"{entry.get('title')} ({str(entry.get('id'))[:14]}…)" for entry in show
            )
            messages.append(
                f"💰 agentbounties claimable + verification-ready work appeared at {checked_at}: "
                f"{listing}. Read the terms and bond size before claiming; wallet spend still "
                "needs the capital-policy check (never flagged standing-meta items)."
            )

    old_mergepay = previous.get("mergepay")
    if mergepay is not None and isinstance(old_mergepay, dict) and "open" in old_mergepay:
        old_mergepay_ids = {entry.get("id") for entry in old_mergepay.get("open", [])}
        appeared_mergepay = [
            entry for entry in mergepay["open"] if entry.get("id") not in old_mergepay_ids
        ]
        if appeared_mergepay:
            listing = "; ".join(
                f"{entry.get('title')} ({entry.get('id')}"
                + (", assigned" if entry.get("assignees") else ", no assignee")
                + ")"
                for entry in appeared_mergepay
            )
            messages.append(
                f"🎯 MergePay-funded issue(s) appeared at {checked_at}: {listing}. "
                "MergePay pays USDC on Arc on merge to the claimant whose PR closes the "
                "issue; verify claim state (assigned ≠ safe to skip), term fitness, and "
                "expect a contested swarm on fresh fundings — read before claiming."
            )

    old_superteam = previous.get("superteam")
    if superteam is not None and isinstance(old_superteam, dict) and "open" in old_superteam:
        old_superteam_slugs = {entry.get("slug") for entry in old_superteam.get("open", [])}
        appeared_superteam = [
            entry for entry in superteam["open"] if entry.get("slug") not in old_superteam_slugs
        ]
        if appeared_superteam:
            listing = "; ".join(
                f"{entry.get('title')} ({entry.get('slug')}; {entry.get('rewardAmount')} "
                f"{entry.get('token')}; deadline {entry.get('deadline')}; "
                f"{entry.get('agentAccess')})"
                for entry in appeared_superteam
            )
            messages.append(
                f"🎯 Superteam agent-eligible listing(s) appeared at {checked_at}: {listing}. "
                "Agents may submit; OAuth, wallet signing, and KYC stay with the human "
                "claimer, and payouts need the human claim flow. Check fit before "
                "submitting — no social accounts are authorized for this operation."
            )

    old_moltjobs = previous.get("moltjobs")
    if moltjobs is not None and isinstance(old_moltjobs, dict) and "open" in old_moltjobs:
        old_moltjobs_ids = {entry.get("id") for entry in old_moltjobs.get("open", [])}
        appeared_moltjobs = [
            entry for entry in moltjobs["open"] if entry.get("id") not in old_moltjobs_ids
        ]
        if appeared_moltjobs:
            listing = "; ".join(
                f"{entry.get('title')} ({entry.get('id')}; {entry.get('budgetUsdc')} USDC; "
                f"{entry.get('purpose')})"
                for entry in appeared_moltjobs
            )
            messages.append(
                f"🛠️ New MoltJobs open job(s) appeared at {checked_at}: {listing}. "
                "Customer (MARKETPLACE) jobs can be bid on once an agent is registered; "
                "PLATFORM_REFERRAL slots require a genuinely different owner and must "
                "never be self-referred."
            )

    if agent_bounties is not None:
        stored_agent_bounties: dict[str, Any] = agent_bounties
    else:
        stored_agent_bounties = {
            "fetchFailed": True,
            "actionable": old_agent_bounties.get("actionable", []),
            "readyToEarn": old_agent_bounties.get("readyToEarn", []),
            "itemStatus": old_agent_bounties.get("itemStatus", {}),
            "counts": old_agent_bounties.get("counts", {}),
        }

    if mergepay is not None:
        stored_mergepay: dict[str, Any] = mergepay
    else:
        stored_mergepay = {
            "fetchFailed": True,
            "open": old_mergepay.get("open", []) if isinstance(old_mergepay, dict) else [],
        }

    if superteam is not None:
        stored_superteam: dict[str, Any] = superteam
    else:
        stored_superteam = {
            "fetchFailed": True,
            "open": old_superteam.get("open", []) if isinstance(old_superteam, dict) else [],
        }

    if moltjobs is not None:
        stored_moltjobs: dict[str, Any] = moltjobs
    else:
        stored_moltjobs = {
            "fetchFailed": True,
            "open": old_moltjobs.get("open", []) if isinstance(old_moltjobs, dict) else [],
        }

    current = {
        "checkedAt": checked_at,
        "status": status,
        "issues": issues,
        "warnings": warnings,
        "service": service,
        "wallet": wallet,
        "catalog": catalog,
        "agentBounties": stored_agent_bounties,
        "mergepay": stored_mergepay,
        "superteam": stored_superteam,
        "moltjobs": stored_moltjobs,
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

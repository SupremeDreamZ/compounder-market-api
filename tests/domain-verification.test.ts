/**
 * Pins the 402index.io domain-ownership proof at /.well-known/402index-verify.txt.
 *
 * The file must serve exactly the registered verification hash as text/plain,
 * with no surrounding whitespace: 402index compares the fetched content against
 * the claim hash, so any drift silently drops the listing out of the
 * domain-verified tier (instant approval, ranked-first discovery).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/well-known/402index-verify.txt/route";
import { INDEX402_VERIFICATION_HASH } from "../lib/product";

test("domain verification file serves exactly the registered hash", async () => {
  const response = await GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/plain/);
  const body = await response.text();
  assert.equal(body, INDEX402_VERIFICATION_HASH);
  assert.equal(body.trim(), body, "verification file must not contain surrounding whitespace");
  assert.match(body, /^[0-9a-f]{64}$/, "verification hash must be a 64-char lowercase hex string");
});

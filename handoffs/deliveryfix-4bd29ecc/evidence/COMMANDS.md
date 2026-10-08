# Executed offline verification commands

New independent fix root: `/workspace/hvac-vetting-deliveryfix-h12ua0yl`.
Working source: `hvac-vetting-offline/development/offline` below that root.
No install, network/model/account calls, Git writes or publication commands were run.

1. Verify all 97 publication manifest entries by actual file bytes, length and SHA-256. Copy the 91-file extracted source package into the new root. Add a node_modules symlink to the existing identical installed dependencies. Result: PASS. Original ZIP hash independently rechecked again at completion.
2. Before fixes, from working source:
   `node --test test/delivery-recovery.test.mjs`
   Initially two tests; both reproduced their defect (QC_HISTORY_RESET / ENOENT after injected ENOSPC). Log: `reproduction-before-fix.log`.
3. After implementation changes, same command: initial 2/2 PASS (`focused-first-fix.log`). Extend to 10 regressions: 10/10 PASS (`focused-final.log`).
4. Final focused run, after strengthening the before/after receipt hash assertion:
   `node --test test/delivery-recovery.test.mjs > /workspace/hvac-vetting-deliveryfix-h12ua0yl/evidence/focused-final-r2.log 2>&1`
   Exit 0, 10/10 PASS. For portable reproduction omit the redirect or use an evidence path under the new extracted directory.
5. Full suite:
   `npm test`
   Exit 0, 39/39 PASS. Logs: `full-offline-final.log` and final `full-offline-final-r2.log`. Existing 29 tests were not edited.
6. Existing sample suite and independent readback:
   `npm run samples`
   `python -B scripts/verify-artifacts.py`
   Exit 0 each. Eight scenarios, nine versions; all independent readbacks PASS. Logs: `samples-final.log` and `independent-readback-final.json`. Compare each representative file against EXPECTED_REPORTS.json with Python hashlib; all three hashes/byte lengths unchanged.
7. On a separate unchanged baseline reproduction copy, put the preserved `evidence/reproduction-tests-before-fix.mjs` at `development/offline/test/delivery-recovery.test.mjs`, then:
   `node --test test/delivery-recovery.test.mjs`
   Observed process exit 1; both original failures reproduced again (`reproduction-before-fix-confirmed.log`). That copy remains locally under `baseline-reproduction-check/`, separate from the fixed source.
8. From fix root:
   `node evidence/verify-original-orphan.mjs`
   Exit 0. Copies the retained actual initial-failure fixture to a new unique directory; recovers it without changing that fixture. Evidence: `ACTUAL_ORPHAN_RECOVERY_RECHECK.json` and `actual-orphan-recovery-recheck.log`.
9. Build a new local ZIP using Python zipfile, selecting the 91 baseline source paths (with the two fixes), new test, handoff and new evidence. Exclude dependencies/runtime/bulk test output. Validate every member against a new manifest, run zip CRC test, extract to a new verification directory and hash every extracted file. Then hash actual final ZIP bytes. Receipt outside ZIP avoids circular self-hashes.

# Restore using only existing matching dependencies

Extract ZIP to a new disposable directory. From its top level:

```sh
sha256sum -c FIX_FILES.sha256
ln -s /path/to/existing/matching/node_modules hvac-vetting-offline/development/offline/node_modules
cd hvac-vetting-offline/development/offline
node --test test/delivery-recovery.test.mjs
npm test
npm run samples
python -B scripts/verify-artifacts.py
```

Node >=22 is required by package.json; actual checks used Node 24.19.0/npm 11.9.0. Python readbacks require existing openpyxl 3.1.5. Do not install under this authorization, reset an existing QC ledger or reuse a live delivery store. The ZIP does not contain dependencies, so a dependency-free machine cannot rebuild offline from this ZIP alone.

For original-failure reproduction, make another independent copy, restore only its two lib files from `evidence/baseline-delivery.mjs` and `evidence/baseline-qc-ledger.mjs`, and replace its regression test with `evidence/reproduction-tests-before-fix.mjs`. Do not overwrite the fixed copy or any original. The two tests should fail with the documented errors. No remote source is needed.

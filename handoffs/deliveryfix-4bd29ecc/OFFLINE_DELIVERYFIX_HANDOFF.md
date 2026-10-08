# Bounded offline delivery fixes

Status: both source-review defects reproduced and fixed in this new disposable copy. No remote changes or publication. The app and engineering acceptance are not complete.

Baseline: published `handoff/visualfix-original-97-736dc2f4`, commit `e394cb80bc71a91b54a5176fd0963fe4935cebd8`. All 97 original local publication files were verified against the reviewed manifest before work and again after verification. The original VISUALFIX ZIP remains 1,431,868 bytes, SHA-256 `736dc2f41691071c0e6cb9ea58db7564392a5f367b191dea85a60d64a23ed35d`. No original source, receipt, archive or prior evidence was changed.

## Reproduced failures

Two regression tests were added before implementation changes. On the unchanged source both failed, test-process exit 1:

- A passes QC round 1 and delivers version 1.0. A genuinely revised Finding passes round 2 and delivers B version 2.0. Exact original A replay raises `QC_HISTORY_RESET`.
- A synthetic filesystem `ENOSPC` at the rename that publishes `journal.json` leaves input, gate and a temporary journal in a final job directory. An unrelated event subsequently raises `ENOENT` while loading that missing journal.

See `evidence/reproduction-before-fix.log` and independently confirmed `evidence/reproduction-before-fix-confirmed.log`. These are actual runs, not source-only deductions. The retained initial-failure fixture and pre-fix source/tests are included for inspection and reproduction in a separate disposable copy.

## Changes from the preserved 91-file source package

Only two existing files changed; 89 remain byte-identical. One regression test file was added. No dependency, renderer, contract/schema, template, baseline test or fixed-input changes.

- `development/offline/lib/qc-ledger.mjs`: `locked` gains read-only historical-prefix verification; `verifyHistoricalQcReplay` exposes it to delivery. Every persisted round is validated, and the completed job's supplied prefix must exactly match. Replays neither import nor truncate receipts. Missing persisted history is rejected. Normal synchronization and recording still reject shorter or rewritten history and enforce the three-round cap.
- `development/offline/lib/delivery.mjs`: only a delivered job with matching event, payload, gate and saved input/gate can use historical-prefix verification. Source, artifact and receipt readbacks remain in force. New work and unfinished reservations use the original strict QC synchronization.
- `delivery.mjs` initialization: write and sync the reservation journal in a private attempt directory, then atomically rename that directory into `jobs/`. Only publication into `jobs/` commits a version reservation. Input/gate are then written immutably and can be completed by exact retry. Failed staging evidence remains under `incomplete-initializations/`. A pre-fix journal-less directory containing only initialization files/temp files is moved there unchanged; a missing journal with artifact, receipt or unexpected evidence is rejected, not hidden.
- `development/offline/test/delivery-recovery.test.mjs`: 10 added tests for the two defects and their reset, tamper, source, three-round, reservation and evidence-retention guards.

A failure before journal publication reserves no version: an unrelated event may receive 1.0 and retry receives 2.0. A failure after journal publication retains reservation 1.0: an unrelated event receives 2.0 and exact retry stays 1.0. Both paths produce exactly two artifacts for two events, and exact replay adds none. This distinction prevents a failed uncommitted candidate journal from becoming an authoritative reservation.

## New verification results

- Focused suite: 10/10 PASS (`focused-final-r2.log`).
- Full suite: 39/39 PASS = unchanged 29 baseline tests + 10 new tests (`full-offline-final-r2.log`). No skips.
- Existing 8 sample scenarios / 9 delivered versions regenerated and independently read back using openpyxl 3.1.5: all PASS (`independent-readback-final.json`). This is a new readback run, distinct from the earlier producer evidence.
- Normal, zero-issue and long-Chinese 18-Finding representative XLSX bytes/hashes match the published `EXPECTED_REPORTS.json` exactly; renderer and template remain unchanged.
- Recovery also ran against a copy of the actual initial ENOSPC orphan, not only a constructed legacy fixture. Its input, gate and unfinished journal remained byte-identical; unrelated event 1.0, original retry 2.0, subsequent replay same path/hash (`ACTUAL_ORPHAN_RECOVERY_RECHECK.json`).
- All 97 original publication files and the original ZIP were rechecked unchanged (`ORIGINALS_FINAL_RECHECK.json`).

## Reproduction and package integrity

Read `evidence/COMMANDS.md`. Tested runtime: Node 24.19.0, npm 11.9.0, Python 3.12.14, openpyxl 3.1.5; lockfile dependencies Ajv 8.17.1, ExcelJS 4.4.0, fflate 0.8.3. Existing installed dependencies were reused through a symlink only in the disposable copy. No installation or network access was performed.

The ZIP excludes node_modules, npm cache, generated runtime ledgers/stores and bulk test-output. It cannot independently rebuild offline unless matching dependencies and Python packages are already available. The small retained failure fixture is evidence, not live runtime state or a reset mechanism.

`FIX_FILES.sha256` is the current package manifest. The nested original `hvac-vetting-offline/FILES.sha256`, README and historical evidence are preserved baseline records; its two changed source entries are expected to differ. Do not treat historical 29-test statements as this fix's results. ZIP bytes/hash and extraction verification are in the adjacent `DELIVERYFIX_RECEIPT.json` and `.zip.sha256`.

## Limits and recovery

Still synthetic/offline only; no real model QC, credentials, Drive, paid calls, new integrations, publication, push, PR, merge, installation, deployment or Sites changes. No source/archived evidence was deleted. Existing implementation cleanup of ephemeral write/lock files remains confined to newly generated disposable runtime directories.

The exact four columns remain 編號／複核文件名稱／問題內容／違反法規. The three-round budget, immutable QC snapshots, filename limits, evidence gates and all prior readbacks remain covered. Original 24-item/four-path and separate Macau/IBC-NFPA requirements remain unfulfilled product scope, not dropped requirements. Reserved-row/example/print-layout choices remain provisional, engineering acceptance NOT_RUN and product score NOT_ASSESSED. No new visual acceptance is claimed because renderer and representative bytes are unchanged.

Injected ENOSPC is a controlled filesystem exception, not a real full disk. These checks establish the tested local exception/retry behavior and atomic directory publication; they do not certify every hardware power-loss/filesystem scenario. Never remove QC history or locks to bypass a blocked operation. Unexpected/corrupt delivered history still stops for investigation. Failed-attempt retention is deliberate; no cleanup or retention policy was introduced.

Rollback: stop using this disposable fix copy and continue with the unchanged originals/published baseline. The local package is not evidence of user receipt or remote saving.

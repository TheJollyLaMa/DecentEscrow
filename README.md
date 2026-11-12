# DecentEscrow
Time lock funds for work/services to be performed with partial release option after timelock

## Additive V1 project default (local, unaudited)

New projects can start with `contracts/default/DecentEscrowV1.sol` and
[`default/index.html`](default/index.html). Existing contracts, ABIs, addresses
and the original interface are unchanged. This is **client-controlled work
escrow, not loan collateral, neutral arbitration, or guaranteed worker payment**.
No live deployment, consumer migration, ArtFi change or router change is included.

### Terms and lifecycle

- `create(payee, asset, amount, deadline, context)` makes the caller the payer,
  collects the exact deposit, and assigns an increasing ID. Payer/payee must
  differ; payee cannot be zero or the escrow itself. Amount must be positive;
  deadline must be a future Unix timestamp. Terms are immutable.
- Native coin uses the zero asset address and exact `msg.value`. ERC20 uses a
  contract address, an explicit allowance and zero `msg.value`. All amounts
  are raw integer units. There are no platform fees.
- Only the payer can `release(id)` for full payment, at any time. Only the payer
  can `settleAfterDeadline(id, paid)` at/after the deadline: `0 <= paid <= amount`,
  with the remainder refunded. Only the payee can `refund(id)` early or late.
  **A payer can refund everything after the deadline; the worker cannot claim
  unilaterally. Inactive payers can leave funds locked indefinitely.**
- Settlement is terminal. Unknown IDs, wrong roles, duplicate settlement,
  premature splits, insufficient balances/allowances and failed transfers revert.
  State and all transfers roll back together. No automatic keeper is involved.
- `Created` and `Settled` plus `orders(id)` expose public evidence. `context` is
  at most 512 UTF-8 bytes: use a public reference/hash, never confidential content.

### Run the usable interface

Requires Node 20+ and npm. From this repository/worktree:

```sh
npm ci
npm test
npm run preview
# http://127.0.0.1:4311/default/  (PORT overrides 4311)
```

The loopback-only preview creates an **ephemeral synthetic chain**, not a public
deployment. Choose actor 1 and connect, create a work order for actor 2, inspect
the new ID, then release. Switch to actor 2 to test returning an open deposit.
For ERC20, paste the displayed mock-token address into Asset; every local actor
has 1,000,000 mock raw units. No wallet or real funds are needed. Restarting
resets chain state; source/tests stay saved. Never fund these deterministic
test accounts or expose the development RPC to a network.

The interface validates raw units, shows roles/terms/current chain-derived
state, limits actions by role, waits for approvals and payment receipts, and
keeps unavailable/error states explicit. Approvals are exact per transaction
(reset to zero first when needed); a confirmed approval can persist if the
subsequent payment fails. No decimal/fiat conversion is inferred.

`npm run build` emits `build/DecentEscrowV1.json`, `default/abi.json` and a local
ethers browser module under `default/vendor/`; these are ignored build outputs.
For a separately reviewed deployment, serve the built `default/` directory and
set `default/config.json` to `mode: "wallet"` with an independently verified
`chainId` and V1 `address`. Empty configuration disables transactions. The preview
always overrides configuration with its own local chain. Wallet mode checks chain
and code presence and disconnects on wallet account/chain changes; code presence
is **not** ABI/bytecode verification. No deployment script is provided.

### Reuse decision and receiving tests

Need: a funded-work default with explicit assets/roles and a usable lifecycle.
Canopy's escrow/invoice/subscription offers led to inspection of those actual
sources, worktrees, remote branch heads and open issues/PRs. The base is
`c316f2dba007fea471cf0aa240a3943954cf0e91` (latest inspected `origin/main`).
Adapted donor: `EscrowMultiWorkOrder.createWorkOrder`, `verifyWork` and
`manualRelease` in `contracts/DecentEscrow.sol`, observed at
`7b894af72ce57835a9554c64084d856bbe7d61b7` and unchanged at the base.
The client-controlled settlement semantics are retained, but native support,
exact accounting, address checks, reentry protection and explicit refund were
added behind a **new incompatible V1 ABI**, not patched into deployed code.
The donor file retains its MIT notice; repository Apache-2.0/NOTICE attribution
is preserved. New `PaymentAsset` is shared by source adaptation with the invoice
and subscription defaults from this explicitly **uncommitted** worktree, not a
released shared dependency.

Validated locally: `npm test` **12/12 passing** (Solidity 0.8.30, optimizer 200,
Shanghai EVM, Ganache 7.9.2, ethers 6.15.0). Coverage includes native/ERC20,
authorization, timelock, split accounting across orders, terminal states,
missing allowance, false/no-return tokens, recipient/sender transfer fees,
rejected native receipts, rollback and reentry attempts.
`scripts/browser-smoke.mjs` also passed native create/release, ERC20
create/payee-refund, invalid input, receipt rendering and 375px layout with no
uncaught browser errors. Optional browser tooling was reused from an existing
local installation, not added as a required dependency:

```sh
mkdir -p .cache
TMPDIR="$PWD/.cache" PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
  node scripts/browser-smoke.mjs
```

Ganache falls back to its JavaScript transport on Node 24/macOS when its optional
native uWS binary is unavailable; validation still passes.

### Integration boundary and deployment gates

Receipts expose chain ID, V1 contract address, transaction hash, block and decoded
events. A future adapter must independently verify chain/address/receipt status,
event log index and current lifecycle/finality; references alone prove neither
work quality nor identity. No receipt is converted into debt, a router action or
an ArtFi/DLend position here. Office/Academy may link the local `/default/`
preview and teach synthetic flows; it is not a public hosted service.

Unsupported: fee/rebasing/reflection or malicious tokens, NFTs, permits,
cross-chain assets, milestones, arbitration, upgradeability, admin recovery and
automatic settlement. Exact inbound/outbound balance checks reject common
transfer-fee behavior but cannot make arbitrary token code trustworthy. Wrongly
sent/forced funds have no rescue function. Before any real use: independent
contract review/audit, approved asset policy, chain-specific testing, explicit
agreement to payer-controlled settlement, bytecode/source verification, wallet
and deployment configuration review, and receipt-adapter tests are required.
Specialized arbitration/collateral models need a separate version and tests.

## Legacy interface: network migration

Base Mainnet (chain ID `8453`) is the current deployment target. The application
uses the chain selected in MetaMask and does not provide a second in-app network
switch. The Base escrow address remains unset until the Remix migration deploys
and verifies the contract.

The existing Optimism escrow address is retained in `js/contract.js` as a legacy
record for recovery and historical work only. New project flows should use Base
and the shared Settlements Router where applicable.

## Local DecentHeader integration

Entries: `index.html` (legacy) and `default/index.html` (V1). One project-themed
native `<decent-header>` provides click-only wallet connect/disconnect, explicit
Pinata/Kubo connection checks and project About. No DBusk widget is included.
Default wallet mode uses `DecentHead.getWallet().snapshot().provider`; account,
chain and disconnect events invalidate contract controls. Synthetic preview
actors remain separate: the header never claims a synthetic actor is a connected
wallet. The configured chain and deployed bytecode remain operation gates.
Legacy Optimism configuration is retained; unknown networks are unavailable.
The legacy entry now visibly reports disconnected, missing-bytecode and
unsupported-network failures instead of leaving them in the replaced hidden
toolbar. It checks deployed code before reading roles or exposing old ABI
operations; the default workspace link does not change routing.

Reuse decision: adapt DecentHead `00691c4fe93fd280f5aec780bdc4fac651bfcdb1`
`js/main.js:DecentHead`, `js/wallet.js:WalletSession`, `Header.js`,
`Header/{WalletConnect,IPFSControls,IPFSStatus,AboutModal}.js` and the manifest
from `docs/ADOPTING.md`. `vendor/decent-head/2.0.0/provenance.json` records files
and adaptations; Apache LICENSE, NOTICE, CC-BY artwork license and ethers license
are retained. Header ethers v6 is a module-local CommonJS wrapper around the
unaltered donor UMD bytes, never replacing legacy ethers v5. Nullable chain
guards make this an observational wallet header, not a guessed chain switch;
horizontal orbit paint is clipped for 375px layouts.

Explicit provider verification additionally reuses **uncommitted** shared
`_wt/header-provider-connect` work based on that donor commit:
`IPFSSession.verifyConnection()` and `IPFSControls`' verify-provider handler.
Pinata authentication or loopback Kubo version response means connectivity only,
not upload permission, backup, pin retention or rewards. Provider selection is
unverified; credentials stay in the header session. All app backup/replication/
reward capabilities remain unavailable; generic upload/pinning controls are
disabled. Canopy's curated agency-map was consulted read-only; receiving
worktrees/open issues and PRs were inspected, preserving saved V1 work. This is
bounded local integration, not whole-library scanning or live synchronization.

Validation: `npm test`; `node scripts/browser-smoke.mjs` (synthetic native/ERC20
lifecycles); `node scripts/header-browser-smoke.mjs` (both actual entries,
reject/connect/account/chain/disconnect, wrong-chain/no-code gates without a
second account request, explicit unconfigured/401/network/Pinata/Kubo probe
states, About Escape/focus, 375px). Supply an existing `PLAYWRIGHT_MODULE` path.
Browser network/wallet responses are synthetic; no real funds or storage
operations occurred. Helpers self-stop. `npm run preview` serves the existing
V1 local sandbox plus an explicit header-asset allowlist; no application router,
deployment or contract changes are part of the header integration.

Daily recovery verification (2026-11-08): preserved the authorized uncommitted
V1/header work; `npm test` passed **25 tests**, and both self-starting browser
harnesses passed (legacy + default headers and synthetic native/ERC20 lifecycle).
The header harness now asserts inert mount, no upload/pin/sign/switch requests,
disabled unavailable storage actions, customized About keyboard open/Tab/Escape
and 375px bounds. Browser launch failure also closes its loopback server.
Use `PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs`
for the existing local browser tooling; no dependency was added.
The stricter browser test first exposed hidden legacy failure text, now fixed.
Ganache reports an unavailable native µWS binary on this Node/macOS combination
and successfully uses its existing JavaScript fallback. Pinata and Kubo ready
states use synthetic endpoint responses, not live credentials/nodes; legacy
ethers resources are mocked/blocked, not deployment verification.
Provenance tests verify exact donor UMD bytes under the module-local wrapper and
the shared uncommitted `js/ipfs.js`/`IPFSControls.js` hashes (the latter differs
only by receiver pin-action disabling). The bounded reuse search covered Canopy
Head/Escrow/Invoice leads, receiving worktrees and the shared provider worktree;
current Head/Escrow/Invoice PR lists were empty. Their open language-adapter/
Supporter-workflow issues are separate from this acceptance test.

## License

Code: [Apache-2.0](LICENSE) · Art and docs: [CC BY 4.0](LICENSES/CC-BY-4.0.txt) · Please keep the [NOTICE](NOTICE) and give The Jolly LaMa / A Decent Agency a head nod when you reuse this work.
Support the work with a [Supporter DNFT](https://thejollylama.github.io/DecentMarket/).


## Link previews

Public entry pages include static Open Graph and Twitter large-image metadata,
with an absolute HTTPS image URL. The 1200 x 630 JPEG at
`assets/social-preview.jpg` previews this public website without a connected wallet.
Keep the image in the deployed artifact when changing the build. After updating
it, check the raw HTML and image response as a crawler; Discord and other services
may cache earlier previews. ENS/IPFS snapshots need a separate site publication;
metadata alone does not update an existing immutable snapshot.

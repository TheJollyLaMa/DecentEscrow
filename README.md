# DecentEscrow
Time lock funds for work/services to be performed with partial release option after timelock

## Network migration

Base Mainnet (chain ID `8453`) is the current deployment target. The application
uses the chain selected in MetaMask and does not provide a second in-app network
switch. The Base escrow address remains unset until the Remix migration deploys
and verifies the contract.

The existing Optimism escrow address is retained in `js/contract.js` as a legacy
record for recovery and historical work only. New project flows should use Base
and the shared Settlements Router where applicable.

## License

Code: [Apache-2.0](LICENSE) · Art and docs: [CC BY 4.0](LICENSES/CC-BY-4.0.txt) · Please keep the [NOTICE](NOTICE) and give The Jolly LaMa / A Decent Agency a head nod when you reuse this work.
Support the work with a [Supporter DNFT](https://thejollylama.github.io/DecentMarket/).

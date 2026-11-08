import fs from 'node:fs';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory } from 'ethers';

export const artifact = name => JSON.parse(fs.readFileSync(`build/${name}.json`));
export async function setup(name) {
  const chain = ganache.provider({ logging: { quiet: true }, chain: { chainId: 31337, hardfork: 'shanghai' },
    wallet: { deterministic: true, totalAccounts: 5 } });
  const provider = new BrowserProvider(chain, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 10;
  const signers = await Promise.all([0, 1, 2].map(n => provider.getSigner(n)));
  const addresses = await Promise.all(signers.map(s => s.getAddress()));
  const deploy = async (contractName, signer = signers[0]) => {
    const a = artifact(contractName);
    const contract = await new ContractFactory(a.abi, a.bytecode, signer).deploy();
    await contract.waitForDeployment();
    return contract;
  };
  const contract = await deploy(name);
  const token = await deploy('TestToken');
  for (const address of addresses) await (await token.mint(address, 1000000n)).wait();
  for (const signer of signers) await (await token.connect(signer).approve(contract.target, 1000000n)).wait();
  const now = async () => Number((await provider.send('eth_getBlockByNumber', ['latest', false])).timestamp);
  const advance = async seconds => { await provider.send('evm_increaseTime', [seconds]); await provider.send('evm_mine', []); };
  return { chain, provider, signers, addresses, contract, token, deploy, now, advance,
    close: async () => { provider.destroy(); await chain.disconnect(); } };
}
export const mined = async tx => (await tx).wait();

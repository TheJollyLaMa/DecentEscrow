import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';

export function compile() {
  const sources = {};
  for (const dir of ['contracts/default', 'test/contracts']) {
    for (const name of fs.readdirSync(dir).filter(name => name.endsWith('.sol'))) {
      const file = `${dir}/${name}`;
      sources[file] = { content: fs.readFileSync(file, 'utf8') };
    }
  }
  const output = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity', sources,
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'shanghai',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } }
  })));
  const errors = (output.errors || []).filter(error => error.severity === 'error');
  if (errors.length) throw Error(errors.map(error => error.formattedMessage).join('\n'));
  fs.mkdirSync('build', { recursive: true });
  for (const contracts of Object.values(output.contracts)) {
    for (const [name, artifact] of Object.entries(contracts)) {
      fs.writeFileSync(`build/${name}.json`, JSON.stringify({
        contractName: name, compiler: solc.version(), abi: artifact.abi,
        bytecode: `0x${artifact.evm.bytecode.object}`
      }, null, 2));
    }
    const config = JSON.parse(fs.readFileSync('default/config.json'));
    const artifact = JSON.parse(fs.readFileSync(`build/${config.contractName}.json`));
    fs.writeFileSync('default/abi.json', JSON.stringify(artifact.abi, null, 2));
    fs.mkdirSync('default/vendor', { recursive: true });
    fs.copyFileSync('node_modules/ethers/dist/ethers.min.js', 'default/vendor/ethers.js');
    fs.copyFileSync('node_modules/ethers/LICENSE.md', 'default/vendor/ethers-LICENSE.md');
  }
  console.log(`Compiled default contracts with ${solc.version()} (Shanghai)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/compile.mjs')) compile();

window.DECENT_CONFIG = {
  version: '2.0.0', appName: 'DecentEscrow', subtitle: 'Review terms · hold · release',
  chain: null, ens: { enabled: false },
  theme: { accent: '#ffc96b', 'accent-2': '#79d4ca', 'bg-1': '#171b25', 'bg-2': '#282330', 'bg-3': '#26362d' },
  about: { title: 'About DecentEscrow', summary: 'Native or ERC20 escrow with explicit payer/payee lifecycle controls.',
    sections: [{ title: 'Safety and networks', body: 'The default preview uses synthetic local actors and assets, never real funds. Production operations require a configured chain, contract code and reviewed terms. A header connection is wallet identity, not contract authorization.' },
      { title: 'Public storage', body: 'Provider selection is not a backup. No app export, replication or rewards adapter is implemented. Never put private work descriptions or secrets on public IPFS.' }] },
  ipfsAdapter: { version: 1, label: 'Escrow storage gates', capabilities: {},
    getStatus: async () => ({ backup: { state: 'unavailable', detail: 'No validated escrow backup adapter. Provider selection does not save records.' } }) },
  links: [{ label: 'Project source', url: 'https://github.com/TheJollyLaMa/DecentEscrow' }],
};

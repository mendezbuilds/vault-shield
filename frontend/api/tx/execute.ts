export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  // On production Vercel, personas are read-only inspectors.
  // Mutating transactions require authentic client-side signing through a connected Web3 testnet wallet.
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      success: false,
      error:
        'Evaluation personas operate in read-only inspection mode on public production deployments. To execute on-chain contract mutations on NEAR Public Testnet, please connect your genuine NEAR testnet wallet using the Auth button in the header.',
    })
  );
}


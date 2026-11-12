// @ts-ignore
import localtunnel from 'localtunnel';
import { createSigningServer, DEFAULT_RUNTIME_PORT, RUNTIME_SECRET } from './server.js';
import { NEW_AGENT_RESTRICTED_PUBLIC_KEY, DEFAULT_CONTRACT_ID, DEFAULT_AGENT_ACCOUNT_ID } from './config.js';

const SUBDOMAIN = process.env.AGENT_TUNNEL_SUBDOMAIN || 'vault-shield-signer-agent';
const PORT = Number(process.env.AGENT_RUNTIME_PORT) || DEFAULT_RUNTIME_PORT;

async function startTunnel(port: number): Promise<any> {
  try {
    const tunnel = await localtunnel({
      port,
      subdomain: SUBDOMAIN,
    });

    console.log(`🚀 HTTPS Tunnel Established: ${tunnel.url}`);
    console.log(`🔐 Authorization Bearer: ${RUNTIME_SECRET}`);
    console.log(`📋 Health Check: ${tunnel.url}/health`);

    tunnel.on('close', () => {
      console.warn('⚠️ Tunnel closed. Reconnecting in 3 seconds...');
      setTimeout(() => startTunnel(port), 3000);
    });

    tunnel.on('error', (err: any) => {
      console.error('Tunnel error:', err?.message || err);
    });

    return tunnel;
  } catch (err: any) {
    console.error('Failed to establish tunnel:', err?.message || err);
    console.log('Retrying tunnel in 5 seconds...');
    setTimeout(() => startTunnel(port), 5000);
  }
}

async function main() {
  console.log('====================================================');
  console.log('🛡️ VAULT SHIELD AUTONOMOUS AGENT SIGNING RUNTIME');
  console.log('====================================================');
  console.log(`Network: NEAR Public Testnet`);
  console.log(`Vault Contract: ${DEFAULT_CONTRACT_ID}`);
  console.log(`Signer Account: ${DEFAULT_AGENT_ACCOUNT_ID}`);
  console.log(`Restricted Key: ${NEW_AGENT_RESTRICTED_PUBLIC_KEY}`);
  console.log(`Permitted Method: request_payment (Deposit: 0 yoctoNEAR)`);
  console.log('----------------------------------------------------');

  const runtime = createSigningServer({ port: PORT });
  await runtime.start();

  await startTunnel(PORT);
}

main().catch(err => {
  console.error('Fatal runtime error:', err);
  process.exit(1);
});

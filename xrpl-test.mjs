import { Client } from 'xrpl';

const client = new Client('wss://s.altnet.rippletest.net:51233');

async function main() {
  await client.connect();
  console.log('Connected to XRPL testnet');
  
  const response = await client.request({
    command: 'server_info'
  });
  
  console.log('Server state:', response.result.info.server_state);
  console.log('Ledger version:', response.result.info.validated_ledger.seq);
  
  await client.disconnect();
  console.log('Disconnected cleanly');
}

main().catch(console.error);
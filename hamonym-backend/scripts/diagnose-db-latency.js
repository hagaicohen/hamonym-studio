require('dotenv').config();
const dns = require('dns');
const net = require('net');
const tls = require('tls');
const { Client } = require('pg');

const HOST = process.env.DB_HOST;
const PORT = Number(process.env.DB_PORT);

function mark(label, t0) {
  const ms = Date.now() - t0;
  console.log(`[${label}] ${ms}ms`);
  return Date.now();
}

async function dnsLookup4(host) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    dns.lookup(host, { family: 4 }, (err, address) => {
      if (err) return reject(err);
      mark(`DNS lookup ${host} (IPv4)`, t0);
      resolve(address);
    });
  });
}

async function rawTcpConnect(address, port, label) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const socket = net.connect({ host: address, port }, () => {
      mark(`Raw TCP connect [${label}]`, t0);
      socket.end();
      resolve();
    });
    socket.on('error', reject);
    socket.setTimeout(15000, () => { socket.destroy(); reject(new Error('TCP timeout')); });
  });
}

async function rawTlsConnect(address, port, label) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const socket = tls.connect({ host: address, port, rejectUnauthorized: false }, () => {
      mark(`Raw TLS connect [${label}]`, t0);
      socket.end();
      resolve();
    });
    socket.on('error', reject);
    socket.setTimeout(20000, () => { socket.destroy(); reject(new Error('TLS timeout')); });
  });
}

async function fullPgConnectCycle(n) {
  const client = new Client({
    host: HOST, port: PORT,
    database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  });
  const t0 = Date.now();
  await client.connect();
  mark(`[cycle ${n}] Full pg connect (TCP+TLS+PG auth)`, t0);

  for (let i = 0; i < 3; i++) {
    const t1 = Date.now();
    await client.query('SELECT 1');
    mark(`[cycle ${n}] SELECT 1 (query #${i + 1} on warm connection)`, t1);
  }

  await client.end();
}

(async () => {
  console.log('=== Diagnostic run:', new Date().toISOString(), '===\n');

  console.log('--- Baseline: raw TCP+TLS to a known-fast, unrelated external host (google.com:443) ---');
  try {
    const gAddr = await dnsLookup4('google.com');
    await rawTcpConnect(gAddr, 443, 'google.com');
    await rawTlsConnect(gAddr, 443, 'google.com');
  } catch (e) { console.log('  google.com ERROR:', e.message); }
  console.log('');

  console.log('--- Raw TCP+TLS directly to the Supabase pooler host (bypassing PG protocol) ---');
  try {
    const dbAddr = await dnsLookup4(HOST);
    await rawTcpConnect(dbAddr, PORT, HOST);
    await rawTlsConnect(dbAddr, PORT, HOST);
  } catch (e) { console.log('  supabase raw ERROR:', e.message); }
  console.log('');

  console.log('--- Full pg Client: 3 separate connect+query cycles ---');
  for (let n = 1; n <= 3; n++) {
    try {
      await fullPgConnectCycle(n);
    } catch (e) { console.log(`  [cycle ${n}] PG ERROR:`, e.message); }
  }

  console.log('\n=== Done ===');
  process.exit(0);
})();

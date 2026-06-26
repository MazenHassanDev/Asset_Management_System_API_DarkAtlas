// In-memory seed data used when VITE_USE_MOCK=true.
// Shape matches the Django serializer described in README.md.

export const MOCK_ASSETS = [
  { id: 'a1', type: 'domain', value: 'example.com', status: 'active', source: 'scan', tags: ['root', 'external'], first_seen: '2024-03-12', last_seen: '2026-06-24', metadata: { registrar: 'Gandi', created: '2014-06-01', nameservers: 'ns1.example.com' } },
  { id: 'a2', type: 'subdomain', value: 'api.example.com', status: 'active', source: 'scan', tags: ['prod'], first_seen: '2024-03-14', last_seen: '2026-06-25', metadata: { http_status: 200, title: 'Acme API Gateway' } },
  { id: 'a3', type: 'subdomain', value: 'app.example.com', status: 'active', source: 'scan', tags: ['prod'], first_seen: '2024-03-14', last_seen: '2026-06-25', metadata: { http_status: 200 } },
  { id: 'a4', type: 'subdomain', value: 'staging.example.com', status: 'active', source: 'scan', tags: ['staging'], first_seen: '2024-05-02', last_seen: '2026-06-23', metadata: { http_status: 200 } },
  { id: 'a5', type: 'subdomain', value: 'dev.example.com', status: 'active', source: 'import', tags: ['dev'], first_seen: '2024-08-19', last_seen: '2026-06-22', metadata: { http_status: 401 } },
  { id: 'a6', type: 'subdomain', value: 'admin.example.com', status: 'active', source: 'scan', tags: ['prod', 'sensitive'], first_seen: '2024-03-20', last_seen: '2026-06-24', metadata: { http_status: 403, note: 'login portal' } },
  { id: 'a7', type: 'subdomain', value: 'mail.example.com', status: 'active', source: 'scan', tags: ['prod'], first_seen: '2024-03-12', last_seen: '2026-06-24', metadata: { mx: true } },
  { id: 'a8', type: 'subdomain', value: 'vpn.example.com', status: 'stale', source: 'scan', tags: ['infra'], first_seen: '2024-03-12', last_seen: '2025-11-02', metadata: { note: 'no response last 3 sweeps' } },
  { id: 'a9', type: 'subdomain', value: 'legacy.example.com', status: 'stale', source: 'import', tags: ['legacy'], first_seen: '2024-03-12', last_seen: '2025-09-15', metadata: { http_status: 200 } },
  { id: 'a10', type: 'ip_address', value: '203.0.113.10', status: 'active', source: 'scan', tags: ['prod'], first_seen: '2024-03-14', last_seen: '2026-06-25', metadata: { asn: 'AS13335', geo: 'US', cloud: 'Cloudflare' } },
  { id: 'a11', type: 'ip_address', value: '203.0.113.25', status: 'active', source: 'scan', tags: ['prod'], first_seen: '2024-03-20', last_seen: '2026-06-24', metadata: { asn: 'AS13335', geo: 'US' } },
  { id: 'a12', type: 'ip_address', value: '198.51.100.7', status: 'active', source: 'scan', tags: ['staging'], first_seen: '2024-05-02', last_seen: '2026-06-23', metadata: { asn: 'AS14618', geo: 'US', cloud: 'AWS' } },
  { id: 'a13', type: 'ip_address', value: '198.51.100.44', status: 'stale', source: 'scan', tags: ['legacy'], first_seen: '2024-03-12', last_seen: '2025-10-20', metadata: { asn: 'AS14618', geo: 'US' } },
  { id: 'a14', type: 'service', value: '443/tcp', status: 'active', source: 'scan', tags: ['prod'], first_seen: '2024-03-14', last_seen: '2026-06-25', metadata: { protocol: 'https', banner: 'nginx/1.18.0' } },
  { id: 'a15', type: 'service', value: '22/tcp', status: 'active', source: 'scan', tags: ['infra', 'sensitive'], first_seen: '2024-03-14', last_seen: '2026-06-24', metadata: { protocol: 'ssh', banner: 'OpenSSH 8.2' } },
  { id: 'a16', type: 'service', value: '80/tcp', status: 'active', source: 'scan', tags: ['prod'], first_seen: '2024-03-14', last_seen: '2026-06-25', metadata: { protocol: 'http', banner: 'nginx/1.18.0' } },
  { id: 'a17', type: 'service', value: '3306/tcp', status: 'active', source: 'scan', tags: ['sensitive', 'db'], first_seen: '2025-02-08', last_seen: '2026-06-24', metadata: { protocol: 'mysql', banner: 'MySQL 8.0.32' } },
  { id: 'a18', type: 'service', value: '8080/tcp', status: 'stale', source: 'scan', tags: ['legacy'], first_seen: '2024-03-12', last_seen: '2025-08-11', metadata: { protocol: 'http-alt', banner: 'Jetty 9.2' } },
  { id: 'a19', type: 'certificate', value: 'CN=api.example.com', status: 'active', source: 'scan', tags: ['prod'], first_seen: '2026-04-09', last_seen: '2026-06-25', metadata: { issuer: "Let's Encrypt", expires: '2026-07-08', key: 'ECDSA P-256' } },
  { id: 'a20', type: 'certificate', value: 'CN=*.example.com', status: 'active', source: 'scan', tags: ['prod'], first_seen: '2025-01-15', last_seen: '2026-06-25', metadata: { issuer: 'DigiCert', expires: '2027-01-15', key: 'RSA 2048' } },
  { id: 'a21', type: 'certificate', value: 'CN=legacy.example.com', status: 'stale', source: 'scan', tags: ['legacy'], first_seen: '2024-08-30', last_seen: '2025-09-15', metadata: { issuer: "Let's Encrypt", expires: '2025-08-30', key: 'RSA 2048' } },
  { id: 'a22', type: 'technology', value: 'nginx 1.18.0', status: 'active', source: 'scan', tags: ['prod'], first_seen: '2024-03-14', last_seen: '2026-06-25', metadata: { category: 'web-server', version: '1.18.0' } },
  { id: 'a23', type: 'technology', value: 'OpenSSL 1.0.2', status: 'active', source: 'scan', tags: ['infra'], first_seen: '2024-03-14', last_seen: '2026-06-24', metadata: { category: 'crypto', version: '1.0.2', eol: true } },
  { id: 'a24', type: 'technology', value: 'WordPress 5.2', status: 'stale', source: 'import', tags: ['legacy'], first_seen: '2024-03-12', last_seen: '2025-09-15', metadata: { category: 'cms', version: '5.2', eol: true } },
  { id: 'a25', type: 'technology', value: 'React 17.0.2', status: 'active', source: 'scan', tags: ['prod'], first_seen: '2024-06-01', last_seen: '2026-06-25', metadata: { category: 'frontend', version: '17.0.2' } },
  { id: 'a26', type: 'technology', value: 'Express 4.18.2', status: 'active', source: 'scan', tags: ['prod'], first_seen: '2024-06-01', last_seen: '2026-06-25', metadata: { category: 'backend', version: '4.18.2' } },
];

export const MOCK_RELATIONSHIPS = [
  { from: 'a2', to: 'a1', type: 'subdomain_of' }, { from: 'a3', to: 'a1', type: 'subdomain_of' },
  { from: 'a4', to: 'a1', type: 'subdomain_of' }, { from: 'a5', to: 'a1', type: 'subdomain_of' },
  { from: 'a6', to: 'a1', type: 'subdomain_of' }, { from: 'a7', to: 'a1', type: 'subdomain_of' },
  { from: 'a8', to: 'a1', type: 'subdomain_of' }, { from: 'a9', to: 'a1', type: 'subdomain_of' },
  { from: 'a2', to: 'a10', type: 'resolves_to' }, { from: 'a3', to: 'a10', type: 'resolves_to' },
  { from: 'a4', to: 'a12', type: 'resolves_to' }, { from: 'a6', to: 'a11', type: 'resolves_to' },
  { from: 'a9', to: 'a13', type: 'resolves_to' }, { from: 'a7', to: 'a11', type: 'resolves_to' },
  { from: 'a14', to: 'a10', type: 'runs_on' }, { from: 'a15', to: 'a10', type: 'runs_on' },
  { from: 'a16', to: 'a10', type: 'runs_on' }, { from: 'a17', to: 'a11', type: 'runs_on' },
  { from: 'a18', to: 'a13', type: 'runs_on' },
  { from: 'a19', to: 'a2', type: 'secures' }, { from: 'a20', to: 'a1', type: 'secures' },
  { from: 'a21', to: 'a9', type: 'secures' },
  { from: 'a22', to: 'a2', type: 'detected_on' }, { from: 'a23', to: 'a14', type: 'detected_on' },
  { from: 'a24', to: 'a9', type: 'detected_on' }, { from: 'a25', to: 'a3', type: 'detected_on' },
  { from: 'a26', to: 'a2', type: 'detected_on' },
];

export const IMPORT_SAMPLE = [
  { id: 'a2', type: 'subdomain', value: 'api.example.com', status: 'active', source: 'scan', tags: ['prod', 'tier-1'], metadata: { http_status: 200, owner: 'platform' } },
  { type: 'subdomain', value: 'cdn.example.com', status: 'active', source: 'scan', tags: ['prod'], metadata: { http_status: 200 } },
  { type: 'ip_address', value: '203.0.113.99', status: 'active', source: 'scan', tags: ['prod'], metadata: { asn: 'AS13335' } },
  { type: 'service', value: '6379/tcp', status: 'active', source: 'scan', tags: ['sensitive', 'db'], metadata: { protocol: 'redis', banner: 'Redis 7.0' } },
  { type: 'certificate', value: 'CN=cdn.example.com', status: 'active', source: 'scan', tags: ['prod'], metadata: { issuer: 'DigiCert', expires: '2026-09-01' } },
  { type: 'subdomain', value: '', status: 'active', tags: [] },
  { value: 'broken-record-no-type' },
];

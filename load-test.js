// Load test for the Cyclops API.
//
// Logs in once as a test user, then has virtual users read the endpoints the
// frontend calls most. It only sends GET requests after login, so it never
// creates or changes data.
//
//   npm run loadtest -- -e BASE_URL=https://api.example.com \
//     -e LOADTEST_EMAIL=loadtest@example.com -e LOADTEST_PASSWORD=...
//
// Pick how hard to push with -e PROFILE=smoke|load|stress (default: smoke).
// `load` and `stress` against anything other than localhost also need
// -e ALLOW_HEAVY=true, so a heavy test can't hit production by accident.
//
// Live graphs: `npm run loadtest` opens k6's dashboard at http://localhost:5665.

import http from 'k6/http';
import { check, fail, group, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const PROFILE = __ENV.PROFILE || 'smoke';
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(BASE_URL);

const PROFILES = {
  // A few users for a minute. Safe to run against production.
  smoke: {
    executor: 'constant-vus',
    vus: 3,
    duration: '1m',
  },
  // Ramps to a busy day's traffic and holds it.
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 20 },
      { duration: '3m', target: 20 },
      { duration: '1m', target: 0 },
    ],
  },
  // Keeps climbing to find where latency or errors break down.
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 50 },
      { duration: '2m', target: 100 },
      { duration: '2m', target: 150 },
      { duration: '1m', target: 0 },
    ],
  },
};

if (!PROFILES[PROFILE]) {
  throw new Error(`Unknown PROFILE "${PROFILE}". Use smoke, load or stress.`);
}
if (PROFILE !== 'smoke' && !IS_LOCAL && __ENV.ALLOW_HEAVY !== 'true') {
  throw new Error(
    `PROFILE=${PROFILE} against ${BASE_URL} needs -e ALLOW_HEAVY=true. ` +
      'It puts real load on that server and its database.',
  );
}

export const options = {
  scenarios: { [PROFILE]: PROFILES[PROFILE] },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    // Latency budgets per endpoint. A breach fails the run (non-zero exit).
    'http_req_duration{endpoint:health}': ['p(95)<200'],
    'http_req_duration{endpoint:me}': ['p(95)<300'],
    'http_req_duration{endpoint:dashboard}': ['p(95)<500'],
    'http_req_duration{endpoint:attention}': ['p(95)<800'],
    'http_req_duration{endpoint:clients}': ['p(95)<500'],
    'http_req_duration{endpoint:projects}': ['p(95)<500'],
    'http_req_duration{endpoint:invoices}': ['p(95)<500'],
    'http_req_duration{endpoint:proposals}': ['p(95)<500'],
  },
};

// Runs once before the virtual users start. Its return value is passed to
// every iteration, so the test logs in once instead of once per request.
export function setup() {
  const email = __ENV.LOADTEST_EMAIL;
  const password = __ENV.LOADTEST_PASSWORD;
  if (!email || !password) {
    fail('Set -e LOADTEST_EMAIL=... and -e LOADTEST_PASSWORD=... for a test account.');
  }

  const response = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'login' } },
  );
  if (response.status !== 200 && response.status !== 201) {
    fail(`Login failed with ${response.status}: ${response.body}`);
  }
  return { token: response.json('accessToken') };
}

function get(path, endpoint, token) {
  const response = http.get(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    tags: { endpoint },
  });
  check(response, { [`${endpoint} returns 200`]: (res) => res.status === 200 });
  return response;
}

export default function ({ token }) {
  group('health', () => {
    get('/', 'health');
  });

  // What the frontend loads when someone opens the app.
  group('open app', () => {
    get('/auth/me', 'me', token);
    get('/dashboard', 'dashboard', token);
    get('/dashboard/attention', 'attention', token);
  });
  sleep(1);

  // Browsing the main lists.
  group('browse', () => {
    get('/client', 'clients', token);
    get('/projects', 'projects', token);
    get('/invoices', 'invoices', token);
    get('/proposals', 'proposals', token);
  });

  // Think time between page views, randomised so users don't move in lockstep.
  sleep(1 + Math.random() * 2);
}

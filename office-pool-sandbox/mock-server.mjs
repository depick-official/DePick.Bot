import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');
const port = Number(process.env.OFFICE_POOL_MOCK_PORT ?? 4199);

async function fixture(name) {
  const text = await readFile(join(fixturesDir, name), 'utf8');
  return JSON.parse(text);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,ngrok-skip-browser-warning',
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function badRequest(message) {
  return {
    statusCode: 400,
    message,
    error: 'Bad Request',
  };
}

function forbidden(message) {
  return {
    statusCode: 403,
    message,
    error: 'Forbidden',
  };
}

function conflict(message) {
  return {
    statusCode: 409,
    message,
    error: 'Conflict',
  };
}

function notFound(message) {
  return {
    statusCode: 404,
    message,
    error: 'Not Found',
  };
}

function scenario(url) {
  return url.searchParams.get('scenario') ?? '';
}

function isKnockout(url, body = {}) {
  const s = scenario(url);
  return (
    s.startsWith('knockout') ||
    url.pathname.includes('knockout') ||
    body.mode === 'KNOCKOUT_STAGE'
  );
}

function hasDuplicatePodiumTeam(structuralPicks) {
  if (structuralPicks?.kind !== 'KNOCKOUT') return false;
  const podium = structuralPicks.podium ?? {};
  const refs = [podium.championTeamRef, podium.runnerUpTeamRef, podium.thirdTeamRef].filter(Boolean);
  const keys = refs.map((ref) => ref.teamIndex ?? ref.providerTeamId ?? ref.displayName).filter((key) => key != null);
  return new Set(keys).size !== keys.length;
}

function poolFixtureFor(url, body = {}) {
  const currentScenario = scenario(url);
  if (currentScenario === 'group' || body.mode === 'GROUP_STAGE') {
    return 'pool-summary.json';
  }
  return isKnockout(url, body) || currentScenario === ''
    ? 'pool-summary-knockout.json'
    : 'pool-summary.json';
}

function isLegacyJoin(body) {
  return Array.isArray(body.sidePicks) && !body.structuralPicks;
}

function isPoolPath(pathname, suffix = '') {
  return new RegExp(`^/office-pools/[^/]+${suffix}$`).test(pathname);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;

    if (req.method === 'OPTIONS') {
      return sendJson(res, 204, {});
    }

    if (req.method === 'GET' && path === '/health') {
      return sendJson(res, 200, { ok: true, service: 'office-pool-sandbox' });
    }

    if (req.method === 'GET' && path === '/office-pools/create-context') {
      const currentScenario = scenario(url);
      const fixtureName = currentScenario === 'knockout-too-late'
        ? 'create-context-knockout-too-late.json'
        : currentScenario === 'group'
          ? 'create-context.json'
          : currentScenario === 'ineligible'
            ? 'create-context-ineligible.json'
            : 'create-context-knockout.json';
      return sendJson(res, 200, await fixture(fixtureName));
    }

    if (req.method === 'GET' && path === '/office-pools/scope-access') {
      return sendJson(res, 200, {
        canCreate: scenario(url) !== 'not-admin',
      });
    }

    if (req.method === 'GET' && (path === '/office-pools' || path === '/office-pools/my')) {
      return sendJson(res, 200, [await fixture(poolFixtureFor(url))]);
    }

    if (req.method === 'POST' && path === '/office-pools') {
      const body = await readBody(req);
      const currentScenario = scenario(url);
      if (currentScenario === 'knockout-too-late') {
        return sendJson(res, 400, badRequest('Knockout pool creation is closed after the first Round of 32 kickoff'));
      }
      if (currentScenario === 'chain-failed') {
        return sendJson(res, 400, badRequest('Office Pool chain create transaction failed'));
      }
      if (currentScenario === 'duplicate-pool') {
        return sendJson(res, 409, conflict('This Telegram group already has an active knockout office pool'));
      }
      if (currentScenario === 'ineligible') {
        return sendJson(res, 400, badRequest('Cannot create group-stage pool with fewer than 36 scoreable matches after T_q'));
      }
      if (Number(body.maxEntryAmount ?? 0) < Number(body.minEntryAmount ?? 0)) {
        return sendJson(res, 400, badRequest('Maximum PICK entry amount must be greater than or equal to minimum'));
      }
      if (currentScenario === 'chain-pending') {
        return sendJson(res, 201, await fixture('pool-summary-chain-pending.json'));
      }
      return sendJson(res, 201, await fixture(poolFixtureFor(url, body)));
    }

    if (req.method === 'GET' && isPoolPath(path)) {
      if (path.includes('/op-sandbox-missing')) {
        return sendJson(res, 404, notFound('Office pool not found'));
      }
      const currentScenario = scenario(url);
      const fixtureName = currentScenario === 'paused'
        ? 'pool-summary-paused.json'
        : currentScenario === 'chain-confirmed'
          ? 'pool-summary-chain-confirmed.json'
          : currentScenario === 'chain-pending'
            ? 'pool-summary-chain-pending.json'
            : currentScenario === 'chain-failed'
              ? 'pool-summary-chain-failed.json'
              : currentScenario === 'group'
                ? 'pool-summary.json'
                : poolFixtureFor(url);
      return sendJson(res, 200, await fixture(fixtureName));
    }

    if (req.method === 'POST' && isPoolPath(path, '/join')) {
      const body = await readBody(req);
      const pool = await fixture(poolFixtureFor(url, body));
      const legacyJoin = isLegacyJoin(body);
      if (scenario(url) === 'join-closed') {
        return sendJson(res, 403, forbidden('Join window is closed'));
      }
      if (scenario(url) === 'paused') {
        return sendJson(res, 403, forbidden('Office pool is temporarily paused'));
      }
      if (!body.structuralPicks && !legacyJoin) {
        return sendJson(res, 400, badRequest('Structural picks are required'));
      }
      if (hasDuplicatePodiumTeam(body.structuralPicks) || scenario(url) === 'duplicate-podium') {
        return sendJson(res, 400, badRequest('Podium picks must use three distinct teams'));
      }
      if (!legacyJoin && Number(body.entryAmount ?? 0) < Number(pool.minEntryAmount)) {
        return sendJson(res, 400, badRequest('Entry amount is below the pool minimum'));
      }
      if (!legacyJoin && Number(body.entryAmount ?? 0) > Number(pool.maxEntryAmount)) {
        return sendJson(res, 400, badRequest('Entry amount is above the pool maximum'));
      }
      if (scenario(url) === 'chain-failed') {
        return sendJson(res, 400, badRequest('Office Pool join transaction failed'));
      }
      const isRetry = scenario(url) === 'idempotent-retry';
      const isConfirmed = scenario(url) === 'chain-confirmed';
      const joinedAt = isRetry ? '2026-06-28T10:00:00.000Z' : new Date().toISOString();
      return sendJson(res, isRetry ? 200 : 201, {
        pool: { ...pool, isMember: true },
        member: {
          userId: 'telegram-user-1002',
          displayNameSnapshot: 'pool_player',
          avatarSnapshot: null,
          championPickTeamId: null,
          championPickTeamName: null,
          createTime: joinedAt,
        },
        entry: {
          entryAmount: body.entryAmount ?? pool.minEntryAmount,
          joinedAt,
        },
        onChain: {
          txHash: isConfirmed ? '0xjoinconfirmed' : isRetry ? '0xjoinpending' : null,
          status: isConfirmed ? 'CONFIRMED' : 'PENDING',
        },
        validation: { ok: true, errors: [] },
        canonicalReadiness: 'PENDING_E15',
        idempotentReplay: isRetry,
        legacyCompatibility: legacyJoin || undefined,
      });
    }

    if (req.method === 'PUT' && isPoolPath(path, '/structural-picks')) {
      await readBody(req);
      const pool = await fixture(scenario(url) === 'knockout' ? 'pool-summary-knockout.json' : 'pool-summary.json');
      return sendJson(res, 200, {
        pool,
        member: {
          userId: 'telegram-user-1002',
          displayNameSnapshot: 'pool_player',
          avatarSnapshot: null,
          championPickTeamId: null,
          championPickTeamName: null,
          createTime: new Date().toISOString(),
        },
        validation: { ok: true, errors: [] },
        canonicalReadiness: 'PENDING_E15',
      });
    }

    if (req.method === 'GET' && isPoolPath(path, '/predictions')) {
      const currentScenario = scenario(url);
      const fixtureName = currentScenario === 'group'
        ? 'predictions.json'
        : currentScenario.startsWith('knockout') || currentScenario === 'future-fixture'
          ? 'predictions-knockout.json'
          : 'predictions-knockout-legacy.json';
      return sendJson(res, 200, await fixture(fixtureName));
    }

    if (req.method === 'GET' && isPoolPath(path, '/members')) {
      return sendJson(res, 200, await fixture('members.json'));
    }

    if (req.method === 'GET' && isPoolPath(path, '/side-picks')) {
      return sendJson(res, 200, []);
    }

    if (req.method === 'GET' && isPoolPath(path, '/picks')) {
      const currentScenario = scenario(url);
      const fixtureName = currentScenario === 'future-fixture' || currentScenario === 'knockout'
        ? 'picks-knockout-future.json'
        : currentScenario === 'locked'
          ? 'picks-locked.json'
          : 'picks.json';
      return sendJson(res, 200, await fixture(fixtureName));
    }

    if (req.method === 'GET' && isPoolPath(path, '/picks/map')) {
      return sendJson(res, 200, {});
    }

    if (req.method === 'POST' && isPoolPath(path, '/picks')) {
      const body = await readBody(req);
      const pickList = Array.isArray(body.picks)
        ? body.picks
        : Object.entries(body.picks ?? {}).map(([slotId, choice]) => ({ slotId, choice }));
      if (scenario(url) === 'future-fixture') {
        return sendJson(res, 400, badRequest('Fixture teams are not known yet'));
      }
      if (scenario(url) === 'locked' || pickList.some((pick) => pick.slotId === 'slot-GROUP_A-LOCKED')) {
        return sendJson(res, 403, forbidden('Slot is already locked'));
      }
      return sendJson(res, 200, { saved: pickList.length });
    }

    if (req.method === 'GET' && isPoolPath(path, '/leaderboard')) {
      const currentScenario = scenario(url);
      const fixtureName = currentScenario === 'knockout-ready'
        ? 'leaderboard-knockout-ready.json'
        : currentScenario === 'ready'
          ? 'leaderboard-ready.json'
          : 'leaderboard.json';
      return sendJson(res, 200, await fixture(fixtureName));
    }

    if (req.method === 'GET' && isPoolPath(path, '/settlement-preview')) {
      const currentScenario = scenario(url);
      const fixtureName = currentScenario === 'already-claimed'
        ? 'settlement-preview-already-claimed.json'
        : currentScenario === 'void-refund'
          ? 'settlement-preview-void-refund.json'
          : currentScenario === 'claimable'
            ? 'settlement-preview-claimable.json'
            : currentScenario === 'settlement-ready'
              ? 'settlement-preview-ready.json'
              : 'settlement-preview.json';
      return sendJson(res, 200, await fixture(fixtureName));
    }

    if (req.method === 'POST' && isPoolPath(path, '/settle')) {
      return sendJson(res, 200, await fixture('leaderboard-knockout-ready.json'));
    }

    return sendJson(res, 404, {
      statusCode: 404,
      message: `No Office Pool sandbox route for ${req.method} ${path}`,
      error: 'Not Found',
    });
  } catch (error) {
    return sendJson(res, 500, {
      statusCode: 500,
      message: error instanceof Error ? error.message : 'Unknown sandbox error',
      error: 'Internal Server Error',
    });
  }
});

server.listen(port, () => {
  console.log(`Office Pool sandbox listening on http://localhost:${port}`);
});

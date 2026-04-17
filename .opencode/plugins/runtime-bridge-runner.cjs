'use strict';

const fs = require('fs');
const path = require('path');

const bridge = require(path.resolve(__dirname, '../../lib/runtime/bridge/opencode.js'));

function readPayload() {
  const raw = fs.readFileSync(0, 'utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

function writeResult(result) {
  process.stdout.write(JSON.stringify(result));
}

function normalizeEvent(type, payload) {
  const sessionId =
    payload?.event?.properties?.sessionID ||
    payload?.event?.properties?.sessionId ||
    payload?.event?.properties?.info?.id ||
    payload?.event?.sessionID ||
    payload?.sessionId ||
    null;

  return payload?.event || {
    type,
    properties: { sessionID: sessionId },
  };
}

function main() {
  const action = process.argv[2];
  if (!action) {
    throw new Error('Missing Memora runner action');
  }

  const payload = readPayload();
  const projectDir = payload.projectDir || process.cwd();
  const deps = { projectDir };

  switch (action) {
    case 'session.created': {
      const event = normalizeEvent('session.created', payload);
      const result = bridge.handleSessionCreated(event, deps);
      writeResult({ ok: true, result });
      return;
    }

    case 'session.deleted': {
      const event = normalizeEvent('session.deleted', payload);
      bridge.handleSessionDeleted(event, deps);
      writeResult({ ok: true });
      return;
    }

    case 'chat.message': {
      const additionalContext = bridge.handleChatMessage(
        payload.input || {},
        payload.output || {},
        deps
      );
      writeResult({ ok: true, additionalContext });
      return;
    }

    case 'tool.execute.before': {
      bridge.handleToolExecuteBefore(payload.input || {}, payload.output || {}, deps);
      writeResult({ ok: true });
      return;
    }

    case 'tool.execute.after': {
      bridge.handleToolExecuteAfter(payload.input || {}, payload.output || {}, deps);
      writeResult({ ok: true });
      return;
    }

    case 'experimental.session.compacting': {
      const output = payload.output || {};
      bridge.handleSessionCompacting(payload.input || {}, output, deps);
      writeResult({ ok: true, output });
      return;
    }

    case 'session.status': {
      const event = normalizeEvent('session.status', payload);
      bridge.handleSessionStatus(event, deps);
      writeResult({ ok: true });
      return;
    }

    default:
      throw new Error(`Unsupported Memora runner action: ${action}`);
  }
}

try {
  main();
} catch (error) {
  writeResult({
    ok: false,
    error: {
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : null,
    },
  });
  process.exit(1);
}

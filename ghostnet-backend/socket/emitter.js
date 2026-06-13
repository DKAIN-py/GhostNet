// ─── GhostNet Socket.io Emitter ───

let io = null;

function initEmitter(socketIoServer) {
  io = socketIoServer;
}

function emitSignal(signal) {
  if (io) {
    io.emit('agent-signal', signal);
    console.log('[SOCKET] Broadcasting to', io.engine.clientsCount, 'clients');
    console.log('[EMIT] agent-signal from', signal.agentId, 'at', signal.timestamp);
  }
}

function emitCascade(cascade) {
  if (io) {
    io.emit('cascade-alert', cascade);
    console.log('[SOCKET] Broadcasting to', io.engine.clientsCount, 'clients');
    console.log('[EMIT] cascade-alert fired, confidence:', cascade.confidence);
  }
}

function emitCascadeClear() {
  if (io) {
    io.emit('cascade-clear', { clearedAt: new Date().toISOString() });
    console.log('[SOCKET] Broadcasting to', io.engine.clientsCount, 'clients');
    console.log('[EMIT] cascade-clear fired at', new Date().toISOString());
  }
}

function emitReplayComplete(date, opts = {}) {
  if (io) {
    const payload = { date, completedAt: new Date().toISOString() };
    if (opts.aborted) payload.aborted = true;
    io.emit('replay-complete', payload);
    console.log('[SOCKET] Broadcasting to', io.engine.clientsCount, 'clients');
    console.log('[EMIT] replay-complete for date:', date, opts.aborted ? '(aborted)' : '');
  }
}

module.exports = { initEmitter, emitSignal, emitCascade, emitCascadeClear, emitReplayComplete };

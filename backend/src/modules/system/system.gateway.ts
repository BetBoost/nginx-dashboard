import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';

import { RunChunk, RunDone, RunRegistry } from './run-registry';

interface SubscribePayload {
  runId: string;
}

/**
 * Socket.io gateway that streams run output to authenticated clients.
 *
 * Auth: clients pass `auth: { token: <accessToken> }` when connecting. The
 * token is verified against the access-token secret on connection; sockets
 * without a valid token are disconnected immediately.
 */
@WebSocketGateway({
  namespace: '/ws/system',
  path: '/api/socket.io',
  cors: { origin: true, credentials: true },
})
export class SystemGateway implements OnGatewayConnection {
  private readonly logger = new Logger(SystemGateway.name);

  constructor(
    private readonly runs: RunRegistry,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  handleConnection(client: Socket): void {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.headers?.authorization as string | undefined)?.replace(/^Bearer\s+/i, '');
      if (!token) {
        client.disconnect(true);
        return;
      }
      const secret = this.config.get<string>('auth.jwt.accessSecret');
      const payload = this.jwt.verify(token, { secret });
      (client.data as Record<string, unknown>).user = payload;
    } catch (err) {
      this.logger.warn(`Socket auth failed: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  @SubscribeMessage('subscribe')
  onSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SubscribePayload,
  ): { ok: boolean; missing?: boolean } {
    const runId = body?.runId;
    if (!runId) return { ok: false };
    const run = this.runs.get(runId);
    if (!run) {
      client.emit('done', { runId, code: null, signal: null, durationMs: 0, error: 'unknown run' });
      return { ok: false, missing: true };
    }

    // Replay buffered chunks first, then live-forward new ones.
    for (const chunk of run.buffer) client.emit('chunk', chunk);
    if (run.finished && run.result) {
      client.emit('done', run.result);
      return { ok: true };
    }

    const onChunk = (chunk: RunChunk) => client.emit('chunk', chunk);
    const onDone = (done: RunDone) => {
      client.emit('done', done);
      run.emitter.off('chunk', onChunk);
      run.emitter.off('done', onDone);
    };
    run.emitter.on('chunk', onChunk);
    run.emitter.once('done', onDone);

    client.once('disconnect', () => {
      run.emitter.off('chunk', onChunk);
      run.emitter.off('done', onDone);
    });
    return { ok: true };
  }
}

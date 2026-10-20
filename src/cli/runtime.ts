import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmod, lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { CollectionManager } from '../collections.js';
import { AppError, publicError } from '../errors.js';
import { GithubClient } from '../github/client.js';
import { executeTool, type ToolServices } from '../tools.js';

export interface RuntimeOptions {
  entry: string;
  version: string;
  services?: () => ToolServices;
  idleMs?: number;
}
interface Descriptor { endpoint: string; token: string; }
type Response = { ok: true; result: unknown } | { ok: false; error: { code: string; message: string } };
const methods = new Set(['collect_activity', 'get_activity', 'cancel_collection']);
const maxRequest = 65_536;

async function location(options: RuntimeOptions) {
  const key = createHash('sha256').update([
    await realpath(options.entry), options.version, String(process.getuid?.() ?? os.userInfo().username),
  ].join('\0')).update(await readFile(options.entry)).digest('hex').slice(0, 20);
  return process.env.PERF_SUMMARY_RUNTIME_DIR ?? path.join(os.tmpdir(), 'ps-' + key);
}

async function privateDirectory(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() ||
    (process.getuid && info.uid !== process.getuid())) {
    throw new AppError('RUNTIME_UNAVAILABLE', '로컬 작업 디렉터리의 소유권을 확인하세요.');
  }
  await chmod(directory, 0o700);
}

async function descriptor(directory: string): Promise<Descriptor | undefined> {
  try {
    const filename = path.join(directory, 'connection.json');
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 4096) return;
    const value: unknown = JSON.parse(await readFile(filename, 'utf8'));
    if (value && typeof value === 'object' && 'endpoint' in value && 'token' in value &&
      typeof value.endpoint === 'string' && typeof value.token === 'string' &&
      /^[a-f0-9-]{36}$/.test(value.token)) return value as Descriptor;
  } catch { /* Missing, stale or interrupted startup. */ }
}

function request(connection: Descriptor, method: string, input: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(connection.endpoint);
    socket.setEncoding('utf8');
    let buffer = '';
    let size = 0;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new AppError('RUNTIME_UNAVAILABLE', '로컬 수집 프로세스에 연결할 수 없습니다. 수집을 다시 시작하세요.'));
    };
    socket.setTimeout(10_000, fail);
    socket.on('error', fail);
    socket.on('end', () => { if (!settled) fail(); });
    socket.on('connect', () => socket.write(JSON.stringify({ ...connection, method, input }) + '\n'));
    socket.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > 16 * 1024 * 1024) { fail(); return; }
      buffer += chunk;
      if (!buffer.includes('\n')) return;
      try {
        const response = JSON.parse(buffer.slice(0, buffer.indexOf('\n'))) as Response;
        if (typeof response.ok !== 'boolean' || (!response.ok &&
          (!response.error || typeof response.error.code !== 'string' || typeof response.error.message !== 'string'))) {
          fail(); return;
        }
        settled = true;
        socket.destroy();
        if (response.ok) resolve(response.result);
        else reject(new AppError(response.error.code, response.error.message));
      } catch { fail(); }
    });
  });
}

async function alive(connection: Descriptor | undefined) {
  if (!connection) return false;
  try { return await request(connection, '__ping', {}) === true; } catch { return false; }
}

export async function callRuntime(method: string, input: unknown, options: RuntimeOptions) {
  const directory = await location(options);
  await privateDirectory(directory);
  let connection = await descriptor(directory);
  if (!await alive(connection)) {
    if (method !== 'collect_activity') throw new AppError('COLLECTION_NOT_FOUND', '수집 결과가 없거나 프로세스가 종료되었습니다. collect_activity로 다시 수집하세요.');
    const lock = path.join(directory, 'starting');
    for (let attempt = 0; attempt < 150; attempt++) {
      connection = await descriptor(directory);
      if (await alive(connection)) break;
      let ownsLock = false;
      try {
        await mkdir(lock);
        ownsLock = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const info = await lstat(lock).catch(() => undefined);
        if (info && Date.now() - info.mtimeMs > 30_000) await rm(lock, { recursive: true, force: true });
      }
      if (ownsLock) {
        try {
          // Another caller may have finished startup before this lock was acquired.
          connection = await descriptor(directory);
          if (await alive(connection)) break;
          const child = spawn(process.execPath, [options.entry, '--worker'], {
            detached: true, stdio: 'ignore', windowsHide: true, env: process.env,
          });
          let failed = false;
          child.on('error', () => { failed = true; });
          child.unref();
          for (let poll = 0; poll < 150 && !failed; poll++) {
            await delay(100);
            connection = await descriptor(directory);
            if (await alive(connection)) break;
          }
          if (!await alive(connection)) throw new AppError('RUNTIME_UNAVAILABLE', '로컬 수집 프로세스를 시작하지 못했습니다. Node.js와 실행 권한을 확인하세요.');
          break;
        } finally { await rm(lock, { recursive: true, force: true }); }
      }
      await delay(100);
    }
  }
  if (!connection || !await alive(connection)) throw new AppError('RUNTIME_UNAVAILABLE', '로컬 작업 프로세스를 시작하지 못했습니다.');
  // Never replay a collection request after sending it: a lost reply must not create duplicate jobs.
  return request(connection, method, input);
}

export async function stopRuntime(options: RuntimeOptions) {
  const directory = await location(options);
  const connection = await descriptor(directory);
  if (await alive(connection)) await request(connection!, '__stop', {});
  return { stopped: true };
}

export async function serveRuntime(options: RuntimeOptions) {
  const directory = await location(options);
  await privateDirectory(directory);
  if (await alive(await descriptor(directory))) return;
  const endpoint = process.platform === 'win32' ?
    '\\\\.\\pipe\\perf-summary-' + randomUUID() : path.join(directory, 'ipc');
  if (process.platform !== 'win32') await rm(endpoint, { force: true });
  const connection = { endpoint, token: randomUUID() };
  const github = new GithubClient();
  const services = options.services?.() ?? { github, collections: new CollectionManager(github) };
  const sockets = new Set<net.Socket>();
  let lastActivity = Date.now();
  let running = 0;
  let closing = false;
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    socket.setTimeout(10_000, () => socket.destroy());
    socket.setEncoding('utf8');
    let buffer = '';
    let handled = false;
    socket.on('data', (chunk: string) => {
      if (handled) return;
      buffer += chunk;
      if (Buffer.byteLength(buffer) > maxRequest) { socket.destroy(); return; }
      if (!buffer.includes('\n')) return;
      handled = true;
      void (async () => {
        let response: Response;
        let stop = false;
        try {
          const payload = JSON.parse(buffer.slice(0, buffer.indexOf('\n')));
          const provided = Buffer.from(typeof payload.token === 'string' ? payload.token : '');
          const expected = Buffer.from(connection.token);
          if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
            throw new AppError('RUNTIME_AUTH', '로컬 작업 인증에 실패했습니다.');
          }
          if (payload.method === '__ping') response = { ok: true, result: true };
          else if (payload.method === '__stop') { response = { ok: true, result: true }; stop = true; }
          else {
            if (!methods.has(payload.method) || closing) throw new AppError('INVALID_INPUT', '지원하지 않는 작업입니다.');
            lastActivity = Date.now();
            const result = await executeTool(payload.method, payload.input, services);
            if (payload.method === 'collect_activity') {
              running++;
              const id = (result as { collectionId: string }).collectionId;
              void services.collections.finished(id).finally(() => { running--; lastActivity = Date.now(); });
            }
            response = { ok: true, result };
          }
        } catch (error) { response = { ok: false, error: publicError(error) }; }
        socket.end(JSON.stringify(response) + '\n', () => { if (stop) void close(); });
      })();
    });
  });
  const idle = setInterval(() => {
    if (!running && Date.now() - lastActivity >= (options.idleMs ?? 3_600_000)) void close();
  }, Math.min(options.idleMs ?? 1000, 1000));
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(idle);
    for (const socket of sockets) socket.destroy();
    await services.collections.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(path.join(directory, 'connection.json'), { force: true });
    if (process.platform !== 'win32') await rm(endpoint, { force: true });
  };
  process.once('SIGTERM', () => { void close(); });
  process.once('SIGINT', () => { void close(); });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(endpoint, () => { server.removeListener('error', reject); resolve(); });
    });
    if (process.platform !== 'win32') await chmod(endpoint, 0o600);
    await writeFile(path.join(directory, 'connection.json'), JSON.stringify(connection), { mode: 0o600 });
  } catch (error) { await close(); throw error; }
}

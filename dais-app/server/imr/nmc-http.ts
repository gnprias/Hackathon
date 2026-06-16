import https from 'node:https';
import { URL } from 'node:url';

/**
 * NMC serves an incomplete TLS chain; Node rejects it by default (UNABLE_TO_VERIFY_LEAF_SIGNATURE).
 * Scope certificate relaxation to nmc.org.in only.
 */
const NMC_TLS_AGENT = new https.Agent({ rejectUnauthorized: false });
const DEFAULT_TIMEOUT_MS = 45_000;

export interface NmcHttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export async function nmcHttpRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {},
): Promise<NmcHttpResponse> {
  const parsed = new URL(url);
  if (parsed.hostname !== 'www.nmc.org.in') {
    throw new Error('nmcHttpRequest is only allowed for www.nmc.org.in');
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: options.method ?? 'GET',
        headers: options.headers,
        agent: NMC_TLS_AGENT,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            text: async () => body,
          });
        });
      },
    );

    const timer = setTimeout(() => {
      req.destroy(new Error(`NMC request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    req.on('close', () => {
      clearTimeout(timer);
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

export function formatNmcRequestError(err: unknown): string {
  if (!(err instanceof Error)) {
    return 'Could not reach NMC servers';
  }

  const cause = (err as Error & { cause?: Error }).cause;
  const message = err.message.trim();
  const causeMessage = cause?.message ?? '';

  if (
    message === 'fetch failed' ||
    causeMessage.includes('certificate') ||
    causeMessage.includes('UNABLE_TO_VERIFY')
  ) {
    return 'Could not connect to the NMC IMR servers from this environment';
  }

  if (message.includes('timed out')) {
    return 'NMC IMR search timed out — try a more specific name or add a State Medical Council';
  }

  if (message.includes('HTTP 500')) {
    return 'NMC could not search that name — use surname only (no Dr prefix or spaces) and add a State Medical Council';
  }

  return message || 'Could not reach NMC servers';
}

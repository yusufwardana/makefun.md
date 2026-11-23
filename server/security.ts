import crypto from 'node:crypto';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';

export function getOperatorAuthToken(): string | null {
  const token = process.env.COMMAND_CENTER_TOKEN?.trim();
  return token && token.length > 0 ? token : null;
}

export function hasOperatorAuth(): boolean {
  return Boolean(getOperatorAuthToken());
}

export function safeTokenEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function requireOperatorAuth(req: Request, res: Response, next: NextFunction): void {
  const configuredToken = getOperatorAuthToken();
  if (!configuredToken) {
    next();
    return;
  }

  const authHeader = req.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  const operatorHeader = (req.get('x-operator-token') || '').trim();
  const supplied = bearerToken || operatorHeader;

  if (!supplied || !safeTokenEquals(supplied, configuredToken)) {
    res.status(401).json({
      error: 'Operator authentication required. Supply valid Bearer or X-Operator-Token matching server COMMAND_CENTER_TOKEN.',
    });
    return;
  }

  next();
}

export function enforceSameOriginCsrf(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }

  const originHeader = req.get('origin');
  const hostHeader = (req.get('host') || '').toLowerCase();
  const refererHeader = (req.get('referer') || '').toLowerCase();

  if (originHeader) {
    try {
      const originUrl = new URL(originHeader);
      const originHost = originUrl.host.toLowerCase();
      const originHostname = originUrl.hostname.toLowerCase();

      const allowedHosts = new Set<string>();
      if (hostHeader) allowedHosts.add(hostHeader);
      if (process.env.APP_URL) {
        try {
          allowedHosts.add(new URL(process.env.APP_URL).host.toLowerCase());
        } catch {
          // ignore malformed APP_URL
        }
      }

      const isLocalOrigin =
        originHost.startsWith('localhost:') ||
        originHost === 'localhost' ||
        originHost.startsWith('127.0.0.1:') ||
        originHost === '127.0.0.1';

      const isCloudRunPreview =
        originHostname.endsWith('.run.app') ||
        originHostname.endsWith('.aistudio.google.com') ||
        refererHeader.includes('.run.app') ||
        refererHeader.includes('.aistudio.google.com');

      if (!allowedHosts.has(originHost) && !(isLocalOrigin && hostHeader.startsWith('localhost:')) && !isCloudRunPreview) {
        res.status(403).json({ error: `Origin "${originHost}" is not permitted to mutate server state.` });
        return;
      }
    } catch {
      res.status(403).json({ error: 'Malformed Origin header rejected by CSRF policy.' });
      return;
    }
  }

  next();
}

// Sliding-window rate limiter per client IP + route bucket
const rateBuckets = new Map<string, number[]>();

export function createRateLimiter(options: {
  bucket: string;
  windowMs: number;
  maxRequests: number;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${options.bucket}:${ip}`;
    const now = Date.now();
    const cutoff = now - options.windowMs;
    const timestamps = (rateBuckets.get(key) || []).filter((t) => t > cutoff);

    if (timestamps.length >= options.maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((timestamps[0] + options.windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: `Rate limit exceeded for ${options.bucket}. Retry in ${retryAfterSec}s.`,
      });
      return;
    }

    timestamps.push(now);
    rateBuckets.set(key, timestamps);
    next();
  };
}

export function isWithinWorkspace(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

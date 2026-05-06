/**
 * BravoForm — Rate Limiter (Sliding Window, in-memory)
 *
 * Proteção contra brute force, abuse e DDoS leve. Funciona standalone
 * em runtime Node.js do Next.js (não requer Redis para começar).
 *
 * ⚠️ LIMITAÇÕES:
 *   - É in-memory: não compartilha estado entre instâncias (Vercel multi-region,
 *     serverless cold starts). Para produção em escala, troque o backend
 *     pelo upstash/redis ou @vercel/kv mantendo a mesma API pública.
 *   - O TTL é refrescado ao acessar — bom o suficiente para mitigar attacks
 *     mas não para auditar consumo de quota por usuário.
 *
 * USO em API route:
 *
 *   const rl = await rateLimit(request, { limit: 30, windowMs: 60_000 });
 *   if (!rl.ok) return rl.response;
 *
 * Ou em rotas autenticadas (rate por usuário):
 *
 *   const rl = await rateLimit(request, { limit: 100, windowMs: 60_000, key: actor.id });
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auditLog, AuditEventType } from '@/lib/audit';

interface Bucket {
  /** Timestamps em ms das últimas requisições */
  timestamps: number[];
  /** Quando essa entrada será limpa (TTL) */
  expiresAt: number;
}

// Map global do processo. Cleanup oportunístico.
const buckets = new Map<string, Bucket>();

// Limita o tamanho do Map para evitar crescimento descontrolado em ataque
const MAX_BUCKETS = 50_000;

function cleanup(now: number) {
  if (buckets.size <= MAX_BUCKETS) return;
  // Remove entradas expiradas
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.expiresAt < now) buckets.delete(key);
  }
  // Se ainda passou do limite, remove os mais antigos
  if (buckets.size > MAX_BUCKETS) {
    const entries = Array.from(buckets.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const toRemove = buckets.size - MAX_BUCKETS;
    for (let i = 0; i < toRemove; i++) buckets.delete(entries[i][0]);
  }
}

function getKey(req: NextRequest, customKey?: string): string {
  if (customKey) return `key:${customKey}`;
  // Fallback: IP do cliente
  const xff = req.headers.get('x-forwarded-for');
  const ip = xff?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  return `ip:${ip}`;
}

export interface RateLimitOptions {
  /** Máximo de requisições no window. Default: 60 */
  limit?: number;
  /** Janela em milissegundos. Default: 60_000 (1 min) */
  windowMs?: number;
  /** Chave custom (ex: actor.id) — se omitido, usa IP */
  key?: string;
  /** Categoria/identificador da rota — útil pra audit log e isolar limites */
  bucket?: string;
}

export type RateLimitResult =
  | { ok: true; remaining: number; reset: number }
  | { ok: false; response: NextResponse; retryAfter: number };

/**
 * Aplica sliding window rate limit.
 * Retorna `{ ok: true, ... }` ou `{ ok: false, response }` para retornar 429.
 */
export async function rateLimit(
  req: NextRequest,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const limit = options.limit ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const bucketName = options.bucket ?? 'default';
  const baseKey = getKey(req, options.key);
  const key = `${bucketName}:${baseKey}`;

  const now = Date.now();
  const windowStart = now - windowMs;

  cleanup(now);

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [], expiresAt: now + windowMs };
    buckets.set(key, bucket);
  }

  // Filtra apenas timestamps DENTRO da janela (sliding window)
  bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);
  bucket.expiresAt = now + windowMs;

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0];
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);

    // Audit log do excesso (severity warn)
    await auditLog({
      eventType: AuditEventType.RATE_LIMIT_EXCEEDED,
      severity: 'warn',
      target: { type: 'route', id: req.nextUrl.pathname, label: bucketName },
      payload: {
        limit,
        windowMs,
        currentCount: bucket.timestamps.length,
        retryAfterSeconds: retryAfter,
      },
      success: false,
      request: req,
    });

    return {
      ok: false,
      retryAfter,
      response: NextResponse.json(
        {
          success: false,
          error: 'Muitas requisições. Tente novamente em alguns segundos.',
          retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.floor((oldest + windowMs) / 1000)),
          },
        }
      ),
    };
  }

  // Adiciona timestamp atual e libera
  bucket.timestamps.push(now);

  return {
    ok: true,
    remaining: limit - bucket.timestamps.length,
    reset: Math.floor((now + windowMs) / 1000),
  };
}

/**
 * Helper combinado para POST/mutations com limite mais agressivo
 * (default: 30 req/min/IP — suficiente pra UI normal, bloqueia scripts)
 */
export async function rateLimitMutation(req: NextRequest, key?: string) {
  return rateLimit(req, {
    limit: 30,
    windowMs: 60_000,
    bucket: 'mutation',
    key,
  });
}

/**
 * Helper para rotas de autenticação (anti-brute-force):
 * 5 tentativas por minuto por IP.
 */
export async function rateLimitAuth(req: NextRequest, key?: string) {
  return rateLimit(req, {
    limit: 5,
    windowMs: 60_000,
    bucket: 'auth',
    key,
  });
}

/**
 * Helper para APIs de leitura — limite mais permissivo (120/min).
 */
export async function rateLimitRead(req: NextRequest, key?: string) {
  return rateLimit(req, {
    limit: 120,
    windowMs: 60_000,
    bucket: 'read',
    key,
  });
}

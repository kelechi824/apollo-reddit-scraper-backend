/**
 * Job Store (serverless-safe)
 * Why this matters: Vercel serverless instances are ephemeral and not sticky.
 * In-memory Maps lose data between invocations, causing 404 "Job not found" during polling.
 * This module provides a shared store backed by Upstash Redis when available,
 * with a safe in-memory fallback for local/dev.
 */

import type { Request } from 'express';

// Optional Redis client (lazy)
let redis: any = null;

const hasUpstash = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface JobData {
  status: 'running' | 'completed' | 'error';
  progress?: number;
  stage?: string;
  message?: string;
  keyword?: string;
  url?: string;
  result?: JsonValue;
  error?: string | null;
  startTime?: number;
  timestamp?: number; // last update timestamp (ms)
  [key: string]: JsonValue | undefined;
}

const DEFAULT_TTL_SECONDS = 2 * 60 * 60; // 2 hours

// In-memory fallback for local/dev
const memoryStore = new Map<string, JobData>();

function getRedis() {
  if (!hasUpstash) return null;
  if (!redis) {
    // Inline import to avoid bundling when not used
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Redis } = require('@upstash/redis');
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    });
  }
  return redis;
}

function jobKey(jobId: string): string {
  return `cc_job:${jobId}`;
}

export async function createJob(
  jobId: string,
  data: JobData,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  const record: JobData = { ...data, timestamp: Date.now() };
  const r = getRedis();
  if (r) {
    await r.set(jobKey(jobId), record, { ex: ttlSeconds });
  } else {
    memoryStore.set(jobId, record);
  }
}

export async function updateJob(
  jobId: string,
  updates: Partial<JobData>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  const r = getRedis();
  if (r) {
    const existing = (await r.get(jobKey(jobId))) as JobData | null;
    const updated: JobData = { ...(existing || ({} as any)), ...updates, timestamp: Date.now() };
    await r.set(jobKey(jobId), updated, { ex: ttlSeconds });
  } else {
    const existing = memoryStore.get(jobId) || ({} as JobData);
    const updated: JobData = { ...existing, ...updates, timestamp: Date.now() };
    memoryStore.set(jobId, updated);
  }
}

export async function getJob(jobId: string): Promise<JobData | null> {
  const r = getRedis();
  if (r) {
    const data = (await r.get(jobKey(jobId))) as JobData | null;
    return data || null;
  }
  return memoryStore.get(jobId) || null;
}

export async function deleteJob(jobId: string): Promise<boolean> {
  const r = getRedis();
  if (r) {
    const res = await r.del(jobKey(jobId));
    return Boolean(res);
  }
  return memoryStore.delete(jobId);
}

export function isServerlessEphemeral(req?: Request): boolean {
  // Heuristic: on Vercel, we often have these envs set
  // The presence of VERCEL indicates serverless; if no Redis, warn in logs
  const vercel = Boolean(process.env.VERCEL);
  return vercel && !hasUpstash;
}

export function getStoreDiagnostics() {
  return {
    usingRedis: hasUpstash,
    provider: hasUpstash ? 'upstash' : 'memory',
    ttlSeconds: DEFAULT_TTL_SECONDS
  } as const;
}

// Note: The caller should call createJob() initially, then updateJob() during progress,
// and getJob() from polling handlers. Delete with deleteJob() when expired or cleaned.



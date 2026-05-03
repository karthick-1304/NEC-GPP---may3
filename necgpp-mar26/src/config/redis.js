// src/config/redis.js
import { createClient } from 'redis';
import logger           from '../utils/logger.js';

const client = createClient({
  socket: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    reconnectStrategy: (retries) => {
      if (retries > 10) return new Error('Redis: too many reconnect attempts');
      return Math.min(retries * 100, 3000);
    }
  },
  ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
});

client.on('error',       (err) => logger.error('Redis error',        { err: err.message }));
client.on('connect',     ()    => logger.info('Redis connected'));
client.on('reconnecting',()    => logger.warn('Redis reconnecting...'));

export const connectRedis = async () => {
  await client.connect();
  logger.info('Redis ready');
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
// All helpers swallow errors and fall through — Redis failure never crashes the app.

export const cacheGet = async (key) => {
  try {
    const val = await client.get(key);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    logger.error('Redis GET failed', { key, err: err.message });
    return null;
  }
};

export const cacheSet = async (key, value, ttlSeconds) => {
  try {
    await client.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    logger.error('Redis SET failed', { key, err: err.message });
  }
};

export const cacheDel = async (...keys) => {
  try {
    if (keys.length) await client.del(keys);
  } catch (err) {
    logger.error('Redis DEL failed', { keys, err: err.message });
  }
};

// Used directly for refresh tokens and OTPs (raw string, not JSON)
export const redisSet  = async (key, value, ttlSeconds) => {
  try {
    await client.setEx(key, ttlSeconds, value);
  } catch (err) {
    logger.error('Redis SET (raw) failed', { key, err: err.message });
  }
};

export const redisGet  = async (key) => {
  try {
    return await client.get(key);
  } catch (err) {
    logger.error('Redis GET (raw) failed', { key, err: err.message });
    return null;
  }
};

export const redisDel  = async (...keys) => {
  try {
    if (keys.length) await client.del(keys);
  } catch (err) {
    logger.error('Redis DEL (raw) failed', { keys, err: err.message });
  }
};

// Set operations — for user session family tracking
export const redisSetAdd     = async (key, member, ttlSeconds) => {
  try {
    await client.sAdd(key, member);
    if (ttlSeconds) await client.expire(key, ttlSeconds);
  } catch (err) {
    logger.error('Redis SADD failed', { key, err: err.message });
  }
};

export const redisSetMembers = async (key) => {
  try {
    return await client.sMembers(key);
  } catch (err) {
    logger.error('Redis SMEMBERS failed', { key, err: err.message });
    return [];
  }
};

export const redisSetRemove  = async (key, member) => {
  try {
    await client.sRem(key, member);
  } catch (err) {
    logger.error('Redis SREM failed', { key, err: err.message });
  }
};

// Returns the remaining TTL in seconds for a key.
// -2 → key does not exist / already expired
// -1 → key exists but has no expiry
export const redisTTL = async (key) => {
  try {
    return await client.ttl(key);
  } catch (err) {
    logger.error('Redis TTL failed', { key, err: err.message });
    return -2;
  }
};


export const closeRedis = async () => {
  try { await client.quit(); logger.info('Redis closed'); }
  catch (err) { logger.error('Redis close error', { err: err.message }); }
};

export default client;
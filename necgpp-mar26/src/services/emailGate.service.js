// Maintenance-mode kill switch for non-mandatory emails.
//
// When ON, only the bypass list of emails is sent — those that contain login
// credentials or otherwise block users (welcome/credentials, password reset
// OTP, password-changed alerts, subject join requests).
// All management notifications (subject/topic/set/test/user activity) are
// silenced and just logged.
//
// State lives in Redis as either:
//   `system:email:disabled_until`     — ISO timestamp + matching TTL (timed)
//   `system:email:disabled_indefinite` — '1' (until manually re-enabled)
//
// `system:email:disabled_meta` carries reason + actorId for observability.

import { redisDel, redisGet, redisSet } from '../config/redis.js';
import logger from '../utils/logger.js';

const KEY_UNTIL       = 'system:email:disabled_until';
const KEY_INDEFINITE  = 'system:email:disabled_indefinite';
const KEY_META        = 'system:email:disabled_meta';
const ONE_YEAR_SECS   = 365 * 24 * 3600;

/**
 * @returns {Promise<boolean>} true if the kill switch is currently active.
 */
export const isMaintenanceActive = async () => {
  try {
    const indef = await redisGet(KEY_INDEFINITE);
    if (indef) return true;
    const until = await redisGet(KEY_UNTIL);
    if (!until) return false;
    return new Date(until).getTime() > Date.now();
  } catch (err) {
    // Redis hiccup → fail open (let mails through). Better than silently dropping mails.
    logger.error('emailGate: redis read failed', { err: err.message });
    return false;
  }
};

/**
 * Returns full state for the admin UI banner.
 */
export const getMaintenanceState = async () => {
  try {
    const indef = await redisGet(KEY_INDEFINITE);
    const meta  = await redisGet(KEY_META);
    if (indef) {
      return { active: true, indefinite: true, disabledUntil: null, secondsRemaining: null,
               meta: meta ? JSON.parse(meta) : null };
    }
    const until = await redisGet(KEY_UNTIL);
    if (!until) {
      return { active: false, indefinite: false, disabledUntil: null, secondsRemaining: 0, meta: null };
    }
    const ms = new Date(until).getTime() - Date.now();
    if (ms <= 0) {
      // Stale (TTL would normally have cleared this) — treat as off.
      await redisDel(KEY_UNTIL, KEY_META);
      return { active: false, indefinite: false, disabledUntil: null, secondsRemaining: 0, meta: null };
    }
    return {
      active: true, indefinite: false,
      disabledUntil: until,
      secondsRemaining: Math.floor(ms / 1000),
      meta: meta ? JSON.parse(meta) : null,
    };
  } catch (err) {
    logger.error('emailGate: getMaintenanceState failed', { err: err.message });
    return { active: false, indefinite: false, disabledUntil: null, secondsRemaining: 0, meta: null };
  }
};

/**
 * Activate the maintenance gate.
 *
 * @param {number|null} durationSec  null → indefinite; else a seconds count.
 * @param {string} reason            free-text label (audited).
 * @param {number} actorId           the admin user_id flipping the switch.
 */
export const activateMaintenance = async (durationSec, reason = '', actorId = null) => {
  const meta = JSON.stringify({
    reason: reason || null,
    actorId,
    activatedAt: new Date().toISOString(),
  });
  if (durationSec === null) {
    await redisSet(KEY_INDEFINITE, '1', ONE_YEAR_SECS);
    await redisDel(KEY_UNTIL);
    await redisSet(KEY_META, meta, ONE_YEAR_SECS);
    logger.warn('Email maintenance ENABLED (indefinite)', { actorId, reason });
  } else {
    const until = new Date(Date.now() + durationSec * 1000).toISOString();
    await redisSet(KEY_UNTIL, until, durationSec);
    await redisDel(KEY_INDEFINITE);
    await redisSet(KEY_META, meta, durationSec);
    logger.warn('Email maintenance ENABLED (timed)', { actorId, reason, durationSec, until });
  }
};

/**
 * Lift the maintenance gate immediately.
 */
export const deactivateMaintenance = async (actorId = null) => {
  await redisDel(KEY_UNTIL, KEY_INDEFINITE, KEY_META);
  logger.warn('Email maintenance DISABLED', { actorId });
};

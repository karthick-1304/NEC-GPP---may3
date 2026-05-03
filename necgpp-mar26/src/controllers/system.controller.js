// src/controllers/system.controller.js
// Admin-only system controls. Currently houses the email kill switch.

import { catchAsync }      from '../utils/catchAsync.js';
import { successResponse } from '../utils/successResponse.js';
import { AppError }        from '../utils/appError.js';
import {
  getMaintenanceState, activateMaintenance, deactivateMaintenance,
} from '../services/emailGate.service.js';

// ─── GET /admin/system/email-status ───────────────────────────────────────
export const getEmailStatus = catchAsync(async (_req, res) => {
  const state = await getMaintenanceState();
  return successResponse(res, state, 'Email status fetched.');
});

// ─── POST /admin/system/email-status ──────────────────────────────────────
// Body shapes:
//   { action: 'enable' }                                                — turn ON (lift suppression)
//   { action: 'disable', durationHours: 1|2|6|24|48|<custom> }          — timed silence
//   { action: 'disable', indefinite: true }                             — until manually re-enabled
// Optional: `reason` is logged for audit.
export const setEmailStatus = catchAsync(async (req, res) => {
  const { action, durationHours, indefinite, reason } = req.body ?? {};
  const actorId = req.user?.userId ?? null;

  if (action === 'enable') {
    await deactivateMaintenance(actorId);
  } else if (action === 'disable') {
    if (indefinite === true) {
      await activateMaintenance(null, reason ?? '', actorId);
    } else {
      const h = Number(durationHours);
      if (!Number.isFinite(h) || h <= 0 || h > 24 * 30) {
        throw new AppError('durationHours must be a positive number ≤ 720 (30 days), or set indefinite=true.', 400);
      }
      await activateMaintenance(Math.round(h * 3600), reason ?? '', actorId);
    }
  } else {
    throw new AppError("action must be 'enable' or 'disable'.", 400);
  }

  const state = await getMaintenanceState();
  return successResponse(res, state, 'Email status updated.');
});

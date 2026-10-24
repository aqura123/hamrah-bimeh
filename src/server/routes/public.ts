import { Router } from 'express';
import { CURRENCY_UNIT_LABELS } from '../../shared/domain.js';
import { getCurrentJalaliPeriod } from '../../shared/jalali.js';
import type { AppConfig } from '../config.js';

export function createPublicRouter(config: AppConfig): Router {
  const router = Router();

  // Minimal health check without sensitive system or database details
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/public/config', (_req, res) => {
    res.json({
      brandNameFa: 'همراه بیمه',
      brandTaglineFa: 'خدمات بیمه‌ای، ساده‌تر و مطمئن‌تر',
      currencyUnit: config.currencyUnit,
      currencyLabel: CURRENCY_UNIT_LABELS[config.currencyUnit],
      businessTimezone: config.businessTimezone,
      currentJalaliPeriod: getCurrentJalaliPeriod(new Date(), config.businessTimezone),
      maxUploadMb: config.maxUploadMb,
      allowedUploadMimes: config.allowedUploadMimes,
      initialPasswordMode: config.initialPasswordMode,
      officeContact: config.publicOfficeContact,
    });
  });

  return router;
}

import { z } from 'zod';
import { Application } from 'express';
import { lookupImrDoctor, NMC_LINKS, searchImrDoctorsByName } from '../imr/nmc-client';
import { getSmcIdByName } from '../../shared/smc-councils';

const LookupBody = z.object({
  smcId: z.number().int().positive(),
  registrationNumber: z.string().min(1).max(32),
});

const NameSearchBody = z.object({
  name: z.string().min(3).max(128),
  smcId: z.number().int().positive().optional(),
  start: z.number().int().min(0).optional(),
  length: z.number().int().min(1).max(50).optional(),
});

const IMR_DISCLAIMER =
  'Registration data from NMC IMR; may be incomplete or stale; not a substitute for primary source verification.';

export function setupImrRoutes(app: Application): void {
  app.post('/api/imr/lookup', async (req, res) => {
    const parsed = LookupBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'smcId and registrationNumber are required' });
      return;
    }

    try {
      const doctor = await lookupImrDoctor(parsed.data.smcId, parsed.data.registrationNumber);
      res.json({
        doctor,
        links: NMC_LINKS,
        disclaimer: IMR_DISCLAIMER,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'IMR lookup failed';
      console.error('[imr] lookup failed:', message);
      res.status(502).json({
        error: message,
        links: NMC_LINKS,
      });
    }
  });

  app.post('/api/imr/search-by-name', async (req, res) => {
    const parsed = NameSearchBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'name (min 3 characters) is required' });
      return;
    }

    try {
      const result = await searchImrDoctorsByName(parsed.data.name, {
        smcId: parsed.data.smcId,
        start: parsed.data.start,
        length: parsed.data.length,
      });

      const doctors = result.doctors.map((doctor) => ({
        ...doctor,
        smcId: doctor.smcId ?? getSmcIdByName(doctor.smcName) ?? null,
      }));

      res.json({
        doctors,
        total: result.total,
        start: result.start,
        length: result.length,
        truncated: result.truncated,
        links: NMC_LINKS,
        disclaimer: IMR_DISCLAIMER,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'IMR name search failed';
      console.error('[imr] name search failed:', message);
      res.status(502).json({
        error: message,
        links: NMC_LINKS,
      });
    }
  });
}

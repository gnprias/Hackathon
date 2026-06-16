import { z } from 'zod';
import { Application } from 'express';
import { verifyFacility } from '../verification/facility-verification';

const VerificationBody = z.object({
  name: z.string().min(1),
  official_website: z.string().nullable().optional(),
  website_working_url: z.string().nullable().optional(),
  address_city: z.string().nullable().optional(),
  address_state_or_region: z.string().nullable().optional(),
  address_country: z.string().nullable().optional(),
  latitude: z.union([z.string(), z.number()]).nullable().optional(),
  longitude: z.union([z.string(), z.number()]).nullable().optional(),
});

export function setupVerificationRoutes(app: Application): void {
  app.post('/api/verification/facility', async (req, res) => {
    const parsed = VerificationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    try {
      const result = await verifyFacility(parsed.data);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      console.error('[verification] facility check failed:', message);
      res.status(502).json({ error: message });
    }
  });
}

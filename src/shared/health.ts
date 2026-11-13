import { z } from 'zod';

// The body of a healthy GET /healthz (docs/api.md). An unhealthy one is a 503.
export const healthOkSchema = z.object({ status: z.literal('ok') });

export type HealthOk = z.infer<typeof healthOkSchema>;

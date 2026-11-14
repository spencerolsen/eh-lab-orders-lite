// One test on an order, as the API returns it. Read from the order_items
// snapshot (the code, name, price and turnaround as they were when the order
// was placed), never from the catalog. Defined once here: the order detail
// (LAB-15), the create response (LAB-12) and the preview (LAB-13) reuse it.
import { z } from 'zod';

export const orderItemSchema = z.object({
  labTestId: z.uuid(),
  testCode: z.string(),
  testName: z.string(),
  // Whole cents.
  priceCents: z.number().int(),
  turnaroundDays: z.number().int(),
});

export type OrderItem = z.infer<typeof orderItemSchema>;

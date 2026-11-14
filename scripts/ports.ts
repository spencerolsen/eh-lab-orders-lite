// Shared by `pnpm dev` (scripts/dev.ts) and `pnpm test:e2e` (scripts/e2e.ts).
import { createServer } from 'node:net';

// True when something already listens on the port at this loopback address.
// The API and Vite listen on 'localhost', which is both 127.0.0.1 and ::1, so
// callers check both. Any other error (::1 on a machine without IPv6) is not
// a port in use.
export function portInUse(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', (error: NodeJS.ErrnoException) => {
      resolve(error.code === 'EADDRINUSE');
    });
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => resolve(false));
    });
  });
}

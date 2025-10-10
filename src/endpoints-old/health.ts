import { Router } from 'express';

export function mountHealth(router: Router) {
  router.get('/health', (_req, res) => res.json({ ok: true }));
}

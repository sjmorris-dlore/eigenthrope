import { getTestMode } from '@/lib/config'

// Public, read-only — powers the site-wide dev banner. Not under /api/admin/
// so it isn't behind the admin auth cookie; it exposes nothing but a boolean.
export async function GET() {
  return Response.json({ test_mode: await getTestMode() })
}

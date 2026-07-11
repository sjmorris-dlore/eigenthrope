import { getTestMode, setTestMode } from '@/lib/config'

export async function GET() {
  return Response.json({ test_mode: await getTestMode() })
}

export async function POST(request: Request) {
  const { enabled } = await request.json() as { enabled: boolean }
  await setTestMode(enabled)
  return Response.json({ ok: true, test_mode: enabled })
}

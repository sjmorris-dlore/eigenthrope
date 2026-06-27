import { invokeAsync } from '@/lib/lambda'

export async function POST(request: Request) {
  const { choice_point } = await request.json() as { choice_point: string }
  if (!choice_point) return Response.json({ error: 'choice_point required' }, { status: 400 })

  await invokeAsync('eigenthrope-create-offers', { choice_point })

  return Response.json({ ok: true, message: 'Offer creation started — check Lambda logs for progress.' }, { status: 202 })
}

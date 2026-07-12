import { activateChoicePoint } from '@/lib/activate'

export async function POST(request: Request) {
  const { choice_point } = await request.json() as { choice_point: string }

  if (!choice_point) {
    return Response.json({ error: 'choice_point is required' }, { status: 400 })
  }

  await activateChoicePoint(choice_point)

  return Response.json({ ok: true, active_choice_point: choice_point })
}

import type { NextRequest } from 'next/server'

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<'/api/vote/[uuid]'>
) {
  const { uuid } = await ctx.params

  const res = await fetch(
    `https://xumm.app/api/v1/platform/payload/${uuid}`,
    {
      headers: {
        'X-API-Key': process.env.NEXT_PUBLIC_XAMAN_API_KEY!,
        'X-API-Secret': process.env.XAMAN_API_SECRET!,
      },
    }
  )

  const data = await res.json()

  return Response.json({
    signed: data.meta?.signed ?? false,
    expired: data.meta?.expired ?? false,
    rejected: data.meta?.cancelled ?? false,
  })
}

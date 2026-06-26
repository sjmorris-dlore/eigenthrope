export async function GET(request: Request) {
  const cid = new URL(request.url).searchParams.get('cid')
  if (!cid) return new Response('cid required', { status: 400 })

  const jwt = process.env.PINATA_JWT
  if (!jwt) return new Response('PINATA_JWT not configured', { status: 500 })

  const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? 'gateway.pinata.cloud'
  const gatewayKey = process.env.PINATA_GATEWAY_KEY

  const headers: Record<string, string> = {}
  if (gatewayKey) headers['x-pinata-gateway-token'] = gatewayKey

  const res = await fetch(`https://${gateway}/ipfs/${cid}`, { headers })

  if (!res.ok) return new Response('Failed to fetch from Pinata', { status: res.status })

  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}

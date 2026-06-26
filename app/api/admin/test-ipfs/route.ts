export async function GET(request: Request) {
  const cid = new URL(request.url).searchParams.get('cid')
  if (!cid) return Response.json({ error: 'cid required' })

  const jwt = process.env.PINATA_JWT
  const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? 'gateway.pinata.cloud'
  const url = `https://${gateway}/ipfs/${cid}`

  const gatewayKey = process.env.PINATA_GATEWAY_KEY
  const headers: Record<string, string> = {}
  if (gatewayKey) headers['x-pinata-gateway-token'] = gatewayKey

  try {
    const res = await fetch(url, { headers })
    const body = await res.text()
    return Response.json({
      url,
      status: res.status,
      statusText: res.statusText,
      contentType: res.headers.get('Content-Type'),
      bodyPreview: body.slice(0, 300),
      hasJwt: !!jwt,
      hasGatewayKey: !!gatewayKey,
      gateway,
    })
  } catch (e) {
    return Response.json({ url, error: String(e), hasJwt: !!jwt, hasGatewayKey: !!gatewayKey, gateway })
  }
}

import { GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { putImageFile, STORIES_BUCKET } from '@/lib/s3'

function s3KeyForImage(choicePoint: string, type: string, ext: string) {
  return `nft-images/${choicePoint.replace(/:/g, '/')}/${type}-${Date.now()}.${ext}`
}

function extFromMime(mime: string) {
  const sub = mime.split('/')[1] ?? 'jpg'
  return sub === 'jpeg' ? 'jpg' : sub
}

export async function POST(request: Request) {
  const form = await request.formData()
  const file = form.get('file') as File | null
  const type = form.get('type') as string | null
  // Vindication artifacts are game-global (one design per iteration), not
  // tied to a chapter — choice_point is only required for the episode types.
  const choicePoint = (form.get('choice_point') as string | null) ?? (type === 'vindication' ? 'vindication' : null)

  if (!file || !choicePoint || !type) {
    return Response.json({ error: 'file, choice_point, and type are required' }, { status: 400 })
  }

  if (type !== 'winner' && type !== 'participation' && type !== 'vindication') {
    return Response.json({ error: 'type must be winner, participation, or vindication' }, { status: 400 })
  }

  const jwt = process.env.PINATA_JWT
  if (!jwt) {
    return Response.json({ error: 'PINATA_JWT not configured' }, { status: 500 })
  }

  const fileBytes = new Uint8Array(await file.arrayBuffer())
  const ext = extFromMime(file.type)
  const s3Key = s3KeyForImage(choicePoint, type, ext)

  const pinataForm = new FormData()
  pinataForm.append('file', new Blob([fileBytes], { type: file.type }), file.name)
  pinataForm.append('pinataMetadata', JSON.stringify({
    name: `${choicePoint}-${type}-${Date.now()}`,
  }))

  const [pinataRes] = await Promise.all([
    fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: pinataForm,
    }),
    STORIES_BUCKET
      ? putImageFile(s3Key, fileBytes, file.type)
      : Promise.resolve(),
  ])

  if (!pinataRes.ok) {
    const err = await pinataRes.text()
    return Response.json({ error: `Pinata error: ${err}` }, { status: 500 })
  }

  const { IpfsHash: imageCid } = await pinataRes.json() as { IpfsHash: string }
  const imageUri = `ipfs://${imageCid}`

  let metadata: { name: string; description: string; image: string }
  if (type === 'vindication') {
    metadata = {
      name: 'Eigenthrope Vindication Artifact',
      description: 'Awarded to an Eigenthrope observer whose sealed observation was vindicated by the story — the ledger proved they saw it first.',
      image: imageUri,
    }
  } else {
    // Fetch chapter label so the NFT metadata has a human-readable name
    const chapterItem = await dynamo.send(new GetCommand({
      TableName: 'eigenthrope_chapters',
      Key: { choice_point: choicePoint },
    }))
    const chapterLabel = (chapterItem.Item as Record<string, unknown>)?.chapter_label as string | undefined ?? choicePoint
    const artifactLabel = type === 'winner' ? 'Winner' : 'Participation'
    metadata = {
      name: `Eigenthrope ${artifactLabel} Artifact — ${chapterLabel}`,
      description: type === 'winner'
        ? `Awarded to an Eigenthrope observer who voted for the winning choice in ${chapterLabel}.`
        : `Awarded to an Eigenthrope observer who voted in ${chapterLabel}.`,
      image: imageUri,
    }
  }

  const metadataRes = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: { name: `${choicePoint}-${type}-metadata` },
    }),
  })

  if (!metadataRes.ok) {
    const err = await metadataRes.text()
    return Response.json({ error: `Pinata metadata error: ${err}` }, { status: 500 })
  }

  const { IpfsHash: metadataCid } = await metadataRes.json() as { IpfsHash: string }
  const metadataUri = `ipfs://${metadataCid}`

  if (type === 'vindication') {
    // Game-global config, not a chapter field
    await dynamo.send(new PutCommand({
      TableName: 'eigenthrope_config',
      Item: {
        key: 'vindication_nft_uri',
        value: { uri: metadataUri, image_key: s3Key },
        updated_at: new Date().toISOString(),
      },
    }))
  } else {
    const nftField = type === 'winner' ? 'winner_nft_uri' : 'participation_nft_uri'
    const imgField = type === 'winner' ? 'winner_image_key' : 'participation_image_key'

    await dynamo.send(new UpdateCommand({
      TableName: 'eigenthrope_chapters',
      Key: { choice_point: choicePoint },
      UpdateExpression: `SET ${nftField} = :uri, ${imgField} = :key`,
      ExpressionAttributeValues: { ':uri': metadataUri, ':key': s3Key },
    }))
  }

  return Response.json({ uri: metadataUri, imageCid, metadataCid, s3_key: s3Key })
}

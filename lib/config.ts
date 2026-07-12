import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from './dynamo'

export async function getResetVersion(): Promise<number> {
  try {
    const result = await dynamo.send(new GetCommand({
      TableName: 'eigenthrope_config',
      Key: { key: 'reset_version' },
    }))
    const v = result.Item?.value
    return typeof v === 'number' ? v : 0
  } catch {
    return 0
  }
}

export async function setResetVersion(version: number): Promise<void> {
  await dynamo.send(new PutCommand({
    TableName: 'eigenthrope_config',
    Item: { key: 'reset_version', value: version },
  }))
}

/**
 * Wallet addresses of the observer bots. The bot process publishes these to
 * eigenthrope_config at startup (key: bot_addresses, value: {name: address}).
 * Used to keep bots out of the winner-NFT tier when humans are in it.
 */
export async function getBotAddresses(): Promise<string[]> {
  try {
    const result = await dynamo.send(new GetCommand({
      TableName: 'eigenthrope_config',
      Key: { key: 'bot_addresses' },
    }))
    const value = result.Item?.value
    if (typeof value !== 'object' || value === null) return []
    return Object.values(value as Record<string, string>).filter(v => typeof v === 'string')
  } catch {
    return []
  }
}

export async function getTestMode(): Promise<boolean> {
  try {
    const result = await dynamo.send(new GetCommand({
      TableName: 'eigenthrope_config',
      Key: { key: 'test_mode' },
    }))
    return result.Item?.value === true
  } catch {
    return false
  }
}

export async function setTestMode(enabled: boolean): Promise<void> {
  await dynamo.send(new PutCommand({
    TableName: 'eigenthrope_config',
    Item: { key: 'test_mode', value: enabled },
  }))
}

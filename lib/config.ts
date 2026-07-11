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

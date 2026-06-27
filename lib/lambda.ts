import { LambdaClient, InvokeCommand, InvocationType } from '@aws-sdk/client-lambda'

export const lambda = new LambdaClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

export async function invokeAsync(functionName: string, payload: unknown) {
  await lambda.send(new InvokeCommand({
    FunctionName: functionName,
    InvocationType: InvocationType.Event, // fire-and-forget
    Payload: Buffer.from(JSON.stringify(payload)),
  }))
}

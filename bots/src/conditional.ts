import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from './aws.js'
import { CHAPTERS_TABLE } from './config.js'

/**
 * Story text may contain conditional blocks (<!--IF ...--> ... <!--END-->)
 * resolved server-side on the website. Bots must resolve them too — raw
 * markers would put BOTH branches (and hidden trait names) into Claude
 * prompts, and a bot could leak the branch that didn't happen.
 *
 * Choice conditions (U03:E01:C == "ChoiceName") resolve against public
 * winning choices from the chapters table. Trait conditions are evaluated
 * against an all-zero profile — bots are FORBIDDEN from reading the real
 * behavioral_profile (hidden scoring), so they see whatever a neutral
 * reader would see. Never "fix" this by loading the profile here.
 */

const CHOICE_EXPR_RE = /^([A-Za-z0-9]+:[A-Za-z0-9]+):C\s*(==|!=)\s*"?([A-Za-z0-9_]+)"?$/
const TRAIT_EXPR_RE = /^(.+?)\s*(>=|<=|!=|>|<|==)\s*(-?\d+)$/
const CONDITION_RE = /<!--(?:IF|ELSEIF)\s+([\s\S]+?)-->/g
const BLOCK_RE = /<!--IF\s+([\s\S]+?)-->([\s\S]*?)<!--END-->/g

type ChoiceContext = Record<string, { letter: string; name?: string }>

function evaluateSimple(expr: string, choices: ChoiceContext): boolean {
  const cm = expr.trim().match(CHOICE_EXPR_RE)
  if (cm) {
    const winner = choices[cm[1].toUpperCase()]
    if (!winner) return false
    const matches = winner.name === cm[3] || winner.letter === cm[3]
    return cm[2] === '==' ? matches : !matches
  }
  // Trait condition against the neutral (all-zero) profile
  const m = expr.trim().match(TRAIT_EXPR_RE)
  if (!m) return false
  const rhs = parseInt(m[3], 10)
  switch (m[2]) {
    case '>':  return 0 > rhs
    case '>=': return 0 >= rhs
    case '<':  return 0 < rhs
    case '<=': return 0 <= rhs
    case '==': return 0 === rhs
    case '!=': return 0 !== rhs
    default:   return false
  }
}

function evaluateExpr(expr: string, choices: ChoiceContext): boolean {
  if (expr.includes(' AND ')) return expr.split(' AND ').every(e => evaluateSimple(e, choices))
  if (expr.includes(' OR ')) return expr.split(' OR ').some(e => evaluateSimple(e, choices))
  return evaluateSimple(expr, choices)
}

/** Load winning choices for chapters referenced by conditionals in the texts. */
async function loadChoiceContext(texts: Array<string | undefined>): Promise<ChoiceContext> {
  const refs = new Set<string>()
  for (const text of texts) {
    if (!text) continue
    for (const m of text.matchAll(CONDITION_RE)) {
      for (const expr of m[1].split(/ AND | OR /)) {
        const cm = expr.trim().match(CHOICE_EXPR_RE)
        if (cm) refs.add(cm[1].toUpperCase())
      }
    }
  }
  if (refs.size === 0) return {}

  const result = await dynamo.send(new ScanCommand({
    TableName: CHAPTERS_TABLE,
    FilterExpression: '#s = :closed AND attribute_exists(winning_choice)',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':closed': 'closed' },
    ProjectionExpression: 'universe, chapter, winning_choice, choices',
  }))

  const context: ChoiceContext = {}
  for (const item of result.Items ?? []) {
    const ref = `${item.universe}:${item.chapter}`.toUpperCase()
    if (!refs.has(ref)) continue
    const letter = item.winning_choice as string
    const choice = (item.choices as Record<string, { name?: string }> | undefined)?.[letter]
    context[ref] = { letter, name: choice?.name }
  }
  return context
}

/** Resolve all conditional blocks in the given texts (undefined passes through). */
export async function resolveStoryTexts<T extends Array<string | undefined>>(texts: T): Promise<T> {
  const choices = await loadChoiceContext(texts)
  return texts.map(text => {
    if (!text) return text
    const resolved = text.replace(BLOCK_RE, (_, condition: string, inner: string) => {
      // Split inner content on ELSEIF/ELSE markers into condition/content segments
      const splitRe = /<!--(?:ELSEIF\s+([\s\S]+?)|ELSE)-->/g
      let lastIdx = 0
      let current: string | null = condition.trim()
      let m: RegExpExecArray | null
      const segments: Array<{ condition: string | null; content: string }> = []
      while ((m = splitRe.exec(inner)) !== null) {
        segments.push({ condition: current, content: inner.slice(lastIdx, m.index) })
        current = m[1]?.trim() ?? null
        lastIdx = m.index + m[0].length
      }
      segments.push({ condition: current, content: inner.slice(lastIdx) })
      for (const seg of segments) {
        if (seg.condition === null || evaluateExpr(seg.condition, choices)) return seg.content
      }
      return ''
    })
    return resolved.replace(/\n{3,}/g, '\n\n')
  }) as T
}

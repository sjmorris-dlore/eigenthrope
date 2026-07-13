/**
 * Resolves conditional blocks in story markdown before serving to players.
 *
 * Syntax (HTML comments, invisible in rendered markdown):
 *
 *   <!--IF Curiosity > 2-->
 *   Text shown when the community profile's Curiosity > 2.
 *   <!--ELSEIF U03:E01:C == "HonorAutonomy"-->
 *   Text shown when U03 episode E01 closed with the choice named HonorAutonomy.
 *   <!--ELSE-->
 *   Default text.
 *   <!--END-->
 *
 * Two kinds of condition:
 *   Trait:   <trait> <op> <integer>       e.g.  Protectiveness >= 3
 *   Choice:  <U>:<E>:C == "<choiceName>"  e.g.  U03:E01:C == "HonorAutonomy"
 *            (also != ; the name is the choice's `name` identifier, set on the
 *            chapter record — the choice letter is accepted as a fallback)
 *
 * Supported operators:  >  >=  <  <=  ==  !=  (choice refs: == and != only)
 * Compound conditions:  AND  OR  (left-to-right, no precedence)
 *
 * Nesting is not supported. Each IF block must be at the top level.
 * Missing traits evaluate as 0. A choice ref whose chapter is missing, still
 * open, or unresolved evaluates as false for BOTH == and != — text gated on
 * a decision never shows before that decision exists.
 *
 * Use validateConditionals() at write time: it rejects unknown traits,
 * unknown chapters, misspelled choice names, and unbalanced markers, so
 * errors surface when saving instead of silently rendering the wrong text.
 */

import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from './dynamo'
import type { BehavioralProfile } from './behavioral'
import { BEHAVIORAL_TRAITS } from './behavioral'

type Profile = Partial<BehavioralProfile>

/** Winning-choice identifiers for a chapter, keyed "U03:E01" (uppercase). */
export interface ChoiceWinner {
  letter: string
  name?: string
}
export type ChoiceContext = Record<string, ChoiceWinner>

// Choice ref expression: U03:E01:C == "HonorAutonomy"  (quotes optional)
const CHOICE_EXPR_RE = /^([A-Za-z0-9]+:[A-Za-z0-9]+):C\s*(==|!=)\s*"?([A-Za-z0-9_]+)"?$/
// Trait expression: Curiosity > 2 (trait names may contain spaces)
const TRAIT_EXPR_RE = /^(.+?)\s*(>=|<=|!=|>|<|==)\s*(-?\d+)$/
// Every IF/ELSEIF condition in a text
const CONDITION_RE = /<!--(?:IF|ELSEIF)\s+([\s\S]+?)-->/g

function simpleExprs(condition: string): string[] {
  return condition.split(/ AND | OR /)
}

// ─── Condition evaluation ────────────────────────────────────────────────────

function evaluateSimple(expr: string, profile: Profile, choices: ChoiceContext): boolean {
  const cm = expr.trim().match(CHOICE_EXPR_RE)
  if (cm) {
    const winner = choices[cm[1].toUpperCase()]
    if (!winner) return false // undecided or unknown chapter: never satisfied
    const matches = winner.name === cm[3] || winner.letter === cm[3]
    return cm[2] === '==' ? matches : !matches
  }

  const m = expr.trim().match(TRAIT_EXPR_RE)
  if (!m) return false
  const trait = m[1].trim()
  const op = m[2]
  const rhs = parseInt(m[3], 10)
  const lhs = (profile as Record<string, number>)[trait] ?? 0
  switch (op) {
    case '>':  return lhs > rhs
    case '>=': return lhs >= rhs
    case '<':  return lhs < rhs
    case '<=': return lhs <= rhs
    case '==': return lhs === rhs
    case '!=': return lhs !== rhs
    default:   return false
  }
}

function evaluateExpr(expr: string, profile: Profile, choices: ChoiceContext): boolean {
  if (expr.includes(' AND ')) {
    return expr.split(' AND ').every(e => evaluateSimple(e, profile, choices))
  }
  if (expr.includes(' OR ')) {
    return expr.split(' OR ').some(e => evaluateSimple(e, profile, choices))
  }
  return evaluateSimple(expr, profile, choices)
}

// ─── Block parser ────────────────────────────────────────────────────────────

interface Segment {
  condition: string | null  // null = ELSE branch
  content: string
}

/**
 * Given the inner content of an IF block (everything between <!--IF cond-->
 * and <!--END-->), split it into condition/content segments.
 */
function parseSegments(firstCondition: string, inner: string): Segment[] {
  const segments: Segment[] = []
  const splitRe = /<!--(?:ELSEIF\s+([\s\S]+?)|ELSE)-->/g

  let lastIdx = 0
  let currentCondition: string | null = firstCondition.trim()
  let m: RegExpExecArray | null

  while ((m = splitRe.exec(inner)) !== null) {
    segments.push({ condition: currentCondition, content: inner.slice(lastIdx, m.index) })
    currentCondition = m[1]?.trim() ?? null   // null → ELSE branch
    lastIdx = m.index + m[0].length
  }
  segments.push({ condition: currentCondition, content: inner.slice(lastIdx) })
  return segments
}

// Non-greedy match: <!--IF condition-->...<!--END-->  (flat blocks only)
const BLOCK_RE = /<!--IF\s+([\s\S]+?)-->([\s\S]*?)<!--END-->/g

// ─── Public resolver ─────────────────────────────────────────────────────────

/**
 * Resolve all <!--IF-->...<!--END--> blocks in `text` against the community
 * profile and (optionally) prior winning choices. Returns clean markdown
 * with no conditional markers.
 */
export function resolveConditionals(text: string, profile: Profile, choices: ChoiceContext = {}): string {
  const resolved = text.replace(BLOCK_RE, (_, condition, inner) => {
    const segments = parseSegments(condition, inner)
    for (const seg of segments) {
      if (seg.condition === null || evaluateExpr(seg.condition, profile, choices)) {
        return seg.content
      }
    }
    return ''
  })

  // Collapse runs of 3+ blank lines that may be left by removed blocks
  return resolved.replace(/\n{3,}/g, '\n\n')
}

// ─── Choice context loading ──────────────────────────────────────────────────

/** All "U03:E01" refs mentioned in choice conditions across the given texts. */
export function extractChoiceRefs(texts: Array<string | null | undefined>): string[] {
  const refs = new Set<string>()
  for (const text of texts) {
    if (!text) continue
    for (const m of text.matchAll(CONDITION_RE)) {
      for (const expr of simpleExprs(m[1])) {
        const cm = expr.trim().match(CHOICE_EXPR_RE)
        if (cm) refs.add(cm[1].toUpperCase())
      }
    }
  }
  return [...refs]
}

/**
 * Load winning choices for every chapter referenced by conditionals in the
 * given texts. Zero-cost (no DB call) when no choice refs are present.
 * Matches on the chapters' STORED universe/chapter fields, like vote memos.
 */
export async function loadChoiceContext(texts: Array<string | null | undefined>): Promise<ChoiceContext> {
  const refs = extractChoiceRefs(texts)
  if (refs.length === 0) return {}

  const result = await dynamo.send(new ScanCommand({
    TableName: 'eigenthrope_chapters',
    FilterExpression: '#s = :closed AND attribute_exists(winning_choice)',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':closed': 'closed' },
    ProjectionExpression: 'universe, chapter, winning_choice, choices',
  }))

  const context: ChoiceContext = {}
  for (const item of result.Items ?? []) {
    const ref = `${item.universe}:${item.chapter}`.toUpperCase()
    if (!refs.includes(ref)) continue
    const letter = item.winning_choice as string
    const choice = (item.choices as Record<string, { name?: string }> | undefined)?.[letter]
    context[ref] = { letter, name: choice?.name }
  }
  return context
}

// ─── Write-time validation ───────────────────────────────────────────────────

/**
 * Validate all conditional markup in `text`. Returns human-readable errors
 * (empty array = valid). Checks:
 *  - balanced IF/END markers, no stray ELSEIF/ELSE outside blocks
 *  - every condition parses as a trait or choice expression
 *  - trait names are real behavioral traits
 *  - choice refs point at chapters that exist, and the compared name matches
 *    one of that chapter's declared choice `name`s (or a choice letter)
 */
export async function validateConditionals(text: string): Promise<string[]> {
  const errors: string[] = []

  // Structure: strip well-formed blocks, then any leftover marker is stray
  const remainder = text.replace(BLOCK_RE, '')
  for (const stray of remainder.matchAll(/<!--\s*(IF|ELSEIF|ELSE|END)\b[\s\S]*?-->/g)) {
    errors.push(`Unbalanced or out-of-place conditional marker: ${stray[0].slice(0, 60)}`)
  }

  // Collect every simple expression from every block's conditions
  const choiceChecks: Array<{ ref: string; rhs: string; expr: string }> = []
  for (const block of text.matchAll(BLOCK_RE)) {
    const conditions = [block[1], ...[...block[2].matchAll(/<!--ELSEIF\s+([\s\S]+?)-->/g)].map(m => m[1])]
    for (const condition of conditions) {
      for (const raw of simpleExprs(condition)) {
        const expr = raw.trim()
        const cm = expr.match(CHOICE_EXPR_RE)
        if (cm) {
          choiceChecks.push({ ref: cm[1].toUpperCase(), rhs: cm[3], expr })
          continue
        }
        const tm = expr.match(TRAIT_EXPR_RE)
        if (tm) {
          const trait = tm[1].trim()
          if (!(BEHAVIORAL_TRAITS as readonly string[]).includes(trait)) {
            errors.push(`Unknown trait "${trait}" in condition "${expr}"`)
          }
          continue
        }
        errors.push(`Unparseable condition "${expr}" — expected e.g. 'Curiosity > 2' or 'U03:E01:C == "ChoiceName"'`)
      }
    }
  }

  if (choiceChecks.length > 0) {
    const result = await dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_chapters',
      ProjectionExpression: 'universe, chapter, choices',
    }))
    const byRef = new Map<string, Record<string, { name?: string }>>()
    for (const item of result.Items ?? []) {
      byRef.set(`${item.universe}:${item.chapter}`.toUpperCase(), (item.choices ?? {}) as Record<string, { name?: string }>)
    }

    for (const { ref, rhs, expr } of choiceChecks) {
      const choices = byRef.get(ref)
      if (!choices) {
        errors.push(`Condition "${expr}" references chapter ${ref}, which does not exist`)
        continue
      }
      const valid = Object.entries(choices).flatMap(([letter, c]) => c.name ? [c.name, letter] : [letter])
      if (!valid.includes(rhs)) {
        errors.push(`Condition "${expr}": "${rhs}" is not a choice of ${ref} (valid: ${valid.join(', ') || 'none — set choice names on the chapter'})`)
      }
    }
  }

  return errors
}

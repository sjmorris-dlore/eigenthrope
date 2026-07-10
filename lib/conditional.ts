/**
 * Resolves conditional blocks in story markdown before serving to players.
 *
 * Syntax (HTML comments, invisible in rendered markdown):
 *
 *   <!--IF Curiosity > 2-->
 *   Text shown when Curiosity > 2.
 *   <!--ELSEIF Protectiveness >= 3-->
 *   Text shown when Protectiveness >= 3 and Curiosity <= 2.
 *   <!--ELSE-->
 *   Default text.
 *   <!--END-->
 *
 * Supported operators:  >  >=  <  <=  ==  !=
 * Compound conditions:  AND  OR  (left-to-right, no precedence)
 *
 * Nesting is not supported. Each IF block must be at the top level.
 * Missing traits evaluate as 0.
 */

import type { BehavioralProfile } from './behavioral'

type Profile = Partial<BehavioralProfile>

// ─── Condition evaluation ────────────────────────────────────────────────────

function evaluateSimple(expr: string, profile: Profile): boolean {
  const m = expr.trim().match(/^(.+?)\s*(>=|<=|!=|>|<|==)\s*(-?\d+)$/)
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

function evaluateExpr(expr: string, profile: Profile): boolean {
  if (expr.includes(' AND ')) {
    return expr.split(' AND ').every(e => evaluateSimple(e, profile))
  }
  if (expr.includes(' OR ')) {
    return expr.split(' OR ').some(e => evaluateSimple(e, profile))
  }
  return evaluateSimple(expr, profile)
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

// ─── Public resolver ─────────────────────────────────────────────────────────

/**
 * Resolve all <!--IF-->...<!--END--> blocks in `text` against `profile`.
 * Returns clean markdown with no conditional markers.
 */
export function resolveConditionals(text: string, profile: Profile): string {
  // Non-greedy match: <!--IF condition-->...<!--END-->
  // Works for flat (non-nested) blocks only.
  const blockRe = /<!--IF\s+([\s\S]+?)-->([\s\S]*?)<!--END-->/g

  const resolved = text.replace(blockRe, (_, condition, inner) => {
    const segments = parseSegments(condition, inner)
    for (const seg of segments) {
      if (seg.condition === null || evaluateExpr(seg.condition, profile)) {
        return seg.content
      }
    }
    return ''
  })

  // Collapse runs of 3+ blank lines that may be left by removed blocks
  return resolved.replace(/\n{3,}/g, '\n\n')
}

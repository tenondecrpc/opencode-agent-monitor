import type { Domain, DomainDetection, AgentMonitorConfig } from "./types.js"
import { getAgentDomains } from "./config.js"

/**
 * Maximum allowed length for a regex pattern string.
 * Prevents excessively complex patterns that could cause performance issues.
 */
const MAX_PATTERN_LENGTH = 200

/**
 * Maximum allowed repetition quantifiers in a pattern.
 * Prevents patterns like (a+)+ that cause catastrophic backtracking.
 */
const MAX_REPETITION_COUNT = 5

/**
 * Patterns that are known to cause catastrophic backtracking (ReDoS).
 * These are rejected outright.
 */
const REDOS_INDICATORS = [
  /\([^()]*\+\)[*+]/,       // (x+)+ or (x+)*
  /\([^()]*\*\)[*+]/,       // (x*)+ or (x*)*
  /\([^()]*\|[^()]*\)[*+]/, // (x|y)+ or (x|y)*
  /\(\.\*\)[*+]/,           // (.*)+ or (.*)*
  /\(\.\+\)[*+]/,           // (.+)+ or (.+)*
]

/**
 * Validate a regex pattern for safety before compilation.
 * Returns true if the pattern is safe to use, false otherwise.
 *
 * Checks:
 * - Pattern length is within bounds
 * - No known ReDoS-inducing structures
 * - Limited repetition quantifiers
 */
function isSafeRegexPattern(pattern: string): boolean {
  // Reject excessively long patterns
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return false
  }

  // Reject patterns with known ReDoS structures
  for (const indicator of REDOS_INDICATORS) {
    if (indicator.test(pattern)) {
      return false
    }
  }

  // Count repetition quantifiers to limit complexity
  const repetitionCount = (pattern.match(/[*+]\??|\{\d+,?\d*\}\??/g) || [])
    .length
  if (repetitionCount > MAX_REPETITION_COUNT) {
    return false
  }

  return true
}

/**
 * Detect domain categories from text using keyword pattern matching.
 * Uses the domain definitions from the config (or built-in defaults).
 * Returns a detection result with domains, confidence, and matched keywords.
 */
export function detectDomains(
  text: string,
  config: AgentMonitorConfig
): DomainDetection {
  const value = String(text).toLowerCase()
  const domainDefs = config.domains || []

  const detections: {
    domain: Domain
    score: number
    keywords: string[]
  }[] = []

  for (const def of domainDefs) {
    const matchedKeywords: string[] = []
    let totalScore = 0

    for (const pattern of def.patterns) {
      // Validate pattern safety before compilation
      if (!isSafeRegexPattern(pattern)) {
        // Skip unsafe patterns silently to prevent ReDoS
        continue
      }

      try {
        const regex = new RegExp(pattern, "i")
        const matches = value.match(regex)
        if (matches && matches.length > 0) {
          matchedKeywords.push(...matches)
          totalScore += matches.length
        }
      } catch {
        // Skip invalid regex patterns silently
        continue
      }
    }

    if (matchedKeywords.length > 0) {
      detections.push({
        domain: def.name,
        score: totalScore,
        keywords: [...new Set(matchedKeywords)],
      })
    }
  }

  // Sort by score descending
  detections.sort((a, b) => b.score - a.score)

  const allKeywords = detections.flatMap((d) => d.keywords)
  const totalMatches = allKeywords.length

  // Calculate confidence based on match density
  const wordCount = value.split(/\s+/).filter(Boolean).length
  const confidence =
    wordCount > 0
      ? Math.min(totalMatches / Math.max(wordCount * 0.1, 1), 1)
      : 0

  return {
    domains: detections.map((d) => d.domain),
    confidence: Math.round(confidence * 100) / 100,
    matchedKeywords: [...new Set(allKeywords)],
  }
}

/**
 * Detect if there is a mismatch between the expected domain for a task
 * and the actual agent that was assigned.
 *
 * Uses the configured agentMappings to determine which domains an agent
 * is responsible for. If no mappings are configured, falls back to
 * checking if the agent name contains the domain name as a substring.
 */
export function detectAgentMismatch(
  taskText: string,
  actualAgent: string,
  config: AgentMonitorConfig
): {
  expectedDomains: Domain[]
  actualAgent: string
  mismatches: Domain[]
  confidence: number
} | null {
  if (!config.enableDomainDetection) return null

  const detection = detectDomains(taskText, config)
  const actual = String(actualAgent || "").toLowerCase()

  if (detection.domains.length === 0 || !actual) return null

  // Check if we have explicit agent mappings
  const agentDomains = getAgentDomains(actualAgent, config)

  let mismatches: Domain[]

  if (agentDomains) {
    // Use explicit mappings: mismatch if detected domain is not in agent's domains
    const agentDomainSet = new Set(agentDomains.map((d) => d.toLowerCase()))
    mismatches = detection.domains.filter(
      (domain) => !agentDomainSet.has(domain.toLowerCase())
    )
  } else {
    // Fallback: check if agent name contains the domain name
    mismatches = detection.domains.filter((domain) => {
      return !actual.includes(domain.toLowerCase())
    })
  }

  if (mismatches.length === 0) return null

  return {
    expectedDomains: detection.domains,
    actualAgent,
    mismatches,
    confidence: detection.confidence,
  }
}

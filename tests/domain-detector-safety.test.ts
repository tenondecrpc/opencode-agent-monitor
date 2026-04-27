import { describe, expect, test } from "vitest"
import { isSafeRegexPattern, detectDomains } from "../src/domain-detector.js"
import { resolveConfig } from "../src/config.js"

/**
 * Helper: create a minimal valid config for tests.
 */
function testConfig(
  overrides: Record<string, unknown> = {}
): ReturnType<typeof resolveConfig> {
  return resolveConfig(overrides as any, "/tmp/test-project")
}

describe("isSafeRegexPattern", () => {
  test("accepts simple patterns", () => {
    expect(isSafeRegexPattern("react")).toBe(true)
    expect(isSafeRegexPattern("frontend")).toBe(true)
    expect(isSafeRegexPattern("\\bapi\\b")).toBe(true)
  })

  test("rejects patterns exceeding MAX_PATTERN_LENGTH (200)", () => {
    const longPattern = "a".repeat(201)
    expect(isSafeRegexPattern(longPattern)).toBe(false)
  })

  test("accepts patterns at exactly MAX_PATTERN_LENGTH", () => {
    const exactPattern = "a".repeat(200)
    expect(isSafeRegexPattern(exactPattern)).toBe(true)
  })

  test("rejects patterns with ReDoS indicator: (x+)+", () => {
    expect(isSafeRegexPattern("(a+)+")).toBe(false)
    expect(isSafeRegexPattern("(a+)*")).toBe(false)
  })

  test("rejects patterns with ReDoS indicator: (x*)+", () => {
    expect(isSafeRegexPattern("(a*)+")).toBe(false)
    expect(isSafeRegexPattern("(a*)*")).toBe(false)
  })

  test("rejects patterns with ReDoS indicator: (x|y)+", () => {
    expect(isSafeRegexPattern("(a|b)+")).toBe(false)
    expect(isSafeRegexPattern("(foo|bar)*")).toBe(false)
  })

  test("rejects patterns with ReDoS indicator: (.*)+", () => {
    expect(isSafeRegexPattern("(.*)+")).toBe(false)
    expect(isSafeRegexPattern("(.+)*")).toBe(false)
  })

  test("rejects patterns with too many repetition quantifiers (>5)", () => {
    // 6 quantifiers: a+b+c+d+e+f
    expect(isSafeRegexPattern("a+b+c+d+e+f")).toBe(false)
  })

  test("accepts patterns with exactly 5 repetition quantifiers", () => {
    // 5 quantifiers: a+b+c+d+e
    expect(isSafeRegexPattern("a+b+c+d+e")).toBe(true)
  })

  test("accepts patterns with quantifier {n,m}", () => {
    expect(isSafeRegexPattern("a{2,5}")).toBe(true)
    expect(isSafeRegexPattern("a{3}")).toBe(true)
  })

  test("rejects patterns with many quantifier repetitions", () => {
    // Multiple {n,m} quantifiers exceeding the limit
    expect(isSafeRegexPattern("a{1,2}b{1,2}c{1,2}d{1,2}e{1,2}f{1,2}")).toBe(
      false
    )
  })
})

describe("detectDomains with unsafe patterns", () => {
  test("skips patterns exceeding MAX_PATTERN_LENGTH without crashing", () => {
    const config = testConfig({
      mergeDomainDefinitions: false,
      domains: [
        {
          name: "test-domain",
          patterns: ["a".repeat(201), "safe-pattern"],
        },
      ],
    })

    const result = detectDomains("test content with safe-pattern", config)
    // Should detect via safe-pattern, not crash on the long one
    expect(result.domains).toContain("test-domain")
    expect(result.matchedKeywords).toContain("safe-pattern")
  })

  test("skips ReDoS patterns without crashing", () => {
    const config = testConfig({
      mergeDomainDefinitions: false,
      domains: [
        {
          name: "test-domain",
          patterns: ["(a+)+", "safe-keyword"],
        },
      ],
    })

    const result = detectDomains("test content with safe-keyword", config)
    // Should detect via safe-keyword, not crash on the ReDoS pattern
    expect(result.domains).toContain("test-domain")
  })

  test("skips invalid regex patterns without crashing", () => {
    const config = testConfig({
      mergeDomainDefinitions: false,
      domains: [
        {
          name: "test-domain",
          patterns: ["[invalid", "safe-keyword"],
        },
      ],
    })

    const result = detectDomains("test content with safe-keyword", config)
    // Should detect via safe-keyword, not crash on the invalid regex
    expect(result.domains).toContain("test-domain")
  })

  test("returns empty domains when all patterns are unsafe", () => {
    const config = testConfig({
      mergeDomainDefinitions: false,
      domains: [
        {
          name: "test-domain",
          patterns: ["(a+)+", "(b*)*", "a".repeat(201)],
        },
      ],
    })

    const result = detectDomains("test content", config)
    expect(result.domains.length).toBe(0)
  })
})

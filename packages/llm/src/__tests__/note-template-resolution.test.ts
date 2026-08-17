import assert from "node:assert/strict"
import test from "node:test"
import {
  getDefaultTemplate,
  getSoapTemplate,
  isValidCustomTemplate,
  resolveTemplate,
} from "../prompts/clinical-note/templates/index.js"
import { getSystemPrompt } from "../prompts/clinical-note/v1.js"

/**
 * Note Template Resolution Tests
 *
 * resolveTemplate() turns a template selection (preset id or user-authored
 * markdown) into the markdown that is embedded in the note-generation prompt.
 * Before this existed the UI passed the literal string "soap" as if it were a
 * markdown template, so the SOAP preset never actually reached the prompt.
 */

test("resolveTemplate returns the default template for the default id", () => {
  assert.equal(resolveTemplate({ templateId: "default" }), getDefaultTemplate())
})

test("resolveTemplate returns the default template when no id is given", () => {
  assert.equal(resolveTemplate(), getDefaultTemplate())
  assert.equal(resolveTemplate({}), getDefaultTemplate())
})

test("resolveTemplate returns the SOAP markdown for the soap id", () => {
  const resolved = resolveTemplate({ templateId: "soap" })

  assert.equal(resolved, getSoapTemplate())
  assert.match(resolved, /^# SOAP Note/)
  assert.match(resolved, /## Subjective/)
  assert.match(resolved, /## Objective/)
  assert.match(resolved, /## Assessment/)
  assert.match(resolved, /## Plan/)
  // Regression: the id itself must never be used as the template body.
  assert.notEqual(resolved, "soap")
})

test("resolveTemplate returns user markdown for the custom id", () => {
  const customTemplate = "# Custom Note\n\n## Reason for Visit\n\n## Plan\n"

  assert.equal(resolveTemplate({ templateId: "custom", customTemplate }), customTemplate.trim())
})

test("resolveTemplate trims surrounding whitespace from custom markdown", () => {
  const resolved = resolveTemplate({
    templateId: "custom",
    customTemplate: "\n\n  # Custom Note\n\n## Plan\n\n  ",
  })

  assert.equal(resolved, "# Custom Note\n\n## Plan")
})

test("resolveTemplate accepts custom markdown that only uses deeper headings", () => {
  const customTemplate = "### Assessment\n\n### Plan\n"

  assert.equal(resolveTemplate({ templateId: "custom", customTemplate }), customTemplate.trim())
})

test("resolveTemplate falls back to default for an empty custom template", () => {
  assert.equal(resolveTemplate({ templateId: "custom" }), getDefaultTemplate())
  assert.equal(resolveTemplate({ templateId: "custom", customTemplate: "" }), getDefaultTemplate())
  assert.equal(resolveTemplate({ templateId: "custom", customTemplate: "   \n\t\n " }), getDefaultTemplate())
})

test("resolveTemplate falls back to default for custom markdown without a heading", () => {
  assert.equal(
    resolveTemplate({ templateId: "custom", customTemplate: "Chief Complaint\nPlan" }),
    getDefaultTemplate(),
  )
  // "#" without a following space is not an ATX heading.
  assert.equal(
    resolveTemplate({ templateId: "custom", customTemplate: "#NotAHeading" }),
    getDefaultTemplate(),
  )
})

test("resolveTemplate falls back to default for an unknown template id", () => {
  assert.equal(resolveTemplate({ templateId: "does-not-exist" }), getDefaultTemplate())
})

test("resolveTemplate ignores custom markdown when a preset id is selected", () => {
  const resolved = resolveTemplate({
    templateId: "soap",
    customTemplate: "# Should Be Ignored\n",
  })

  assert.equal(resolved, getSoapTemplate())
})

test("isValidCustomTemplate accepts markdown with headings and rejects everything else", () => {
  assert.equal(isValidCustomTemplate("# Title\n"), true)
  assert.equal(isValidCustomTemplate("## Section\n"), true)
  assert.equal(isValidCustomTemplate("Intro text\n\n## Section\n"), true)
  assert.equal(isValidCustomTemplate(""), false)
  assert.equal(isValidCustomTemplate("   "), false)
  assert.equal(isValidCustomTemplate("no headings here"), false)
  assert.equal(isValidCustomTemplate(undefined), false)
})

/**
 * Integration: the resolved markdown is what note generation actually sees.
 * getSystemPrompt is the single boundary where the template reaches the model.
 */
test("note generation embeds the resolved SOAP markdown in the system prompt", () => {
  const template = resolveTemplate({ templateId: "soap" })
  const systemPrompt = getSystemPrompt("long", template)

  assert.ok(systemPrompt.includes(getSoapTemplate()), "system prompt should contain the SOAP markdown")
  assert.ok(
    !systemPrompt.includes(getDefaultTemplate()),
    "system prompt should not contain the default markdown when SOAP is selected",
  )
})

test("note generation embeds resolved custom markdown in the system prompt", () => {
  const customTemplate = "# Derm Visit\n\n## Lesion Description\n\n## Plan\n"
  const template = resolveTemplate({ templateId: "custom", customTemplate })
  const systemPrompt = getSystemPrompt("short", template)

  assert.ok(systemPrompt.includes("## Lesion Description"), "system prompt should contain the custom sections")
  assert.ok(
    !systemPrompt.includes(getDefaultTemplate()),
    "system prompt should not contain the default markdown when a valid custom template is set",
  )
})

test("note generation falls back to the default markdown for an invalid custom template", () => {
  const template = resolveTemplate({ templateId: "custom", customTemplate: "   " })
  const systemPrompt = getSystemPrompt("long", template)

  assert.ok(systemPrompt.includes(getDefaultTemplate()), "system prompt should contain the default markdown")
})

/**
 * Server-side API key loading
 * This module can only be used in server-side code (API routes, server actions)
 */

import { readFileSync } from "fs"
import { join } from "path"

function getConfigPath(): string {
  // In production (Electron), use userData path
  // In development, use .api-keys.json in project root
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    try {
      // Try to get Electron app userData path
      const { app } = require("electron")
      if (app && app.getPath) {
        return join(app.getPath("userData"), "api-keys.json")
      }
    } catch (error) {
      // Electron not available, fallback to env var
    }
  }

  // Development fallback
  return join(process.cwd(), ".api-keys.json")
}

export function getOpenAIApiKey(): string {
  // First try to load from config file
  try {
    const configPath = getConfigPath()
    const fileContent = readFileSync(configPath, "utf-8")
    const config = JSON.parse(fileContent)
    if (config.openaiApiKey) {
      return config.openaiApiKey
    }
  } catch (error) {
    // Config file doesn't exist or is invalid, fall through to env var
  }

  // Fallback to environment variable
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    throw new Error("Missing OPENAI_API_KEY. Please configure your API key in Settings.")
  }
  return key
}

export function getAnthropicApiKey(): string {
  // First try to load from config file
  try {
    const configPath = getConfigPath()
    const fileContent = readFileSync(configPath, "utf-8")
    const config = JSON.parse(fileContent)
    if (config.anthropicApiKey) {
      return config.anthropicApiKey
    }
  } catch (error) {
    // Config file doesn't exist or is invalid, fall through to env var
  }

  // Fallback to environment variable
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    throw new Error("Missing ANTHROPIC_API_KEY. Please configure your API key in Settings.")
  }
  return key
}

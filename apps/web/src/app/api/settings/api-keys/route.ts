import { NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"

// Get the app data directory for storing config
function getConfigPath(): string {
  try {
    // Try to load Electron dynamically (only available at runtime in packaged app)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require("electron")
    if (app && app.getPath) {
      // Electron environment
      const userDataPath = app.getPath("userData")
      return path.join(userDataPath, "api-keys.json")
    }
  } catch (error) {
    // Electron not available (development or build time)
  }
  // Development environment - use temp directory
  return path.join(process.cwd(), ".api-keys.json")
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { openaiApiKey, anthropicApiKey } = body

    const configPath = getConfigPath()

    // Save the keys to a JSON file
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          openaiApiKey: openaiApiKey || "",
          anthropicApiKey: anthropicApiKey || "",
        },
        null,
        2
      ),
      "utf-8"
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to save API keys:", error)
    return NextResponse.json(
      { error: "Failed to save API keys" },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const configPath = getConfigPath()

    try {
      const fileContent = await fs.readFile(configPath, "utf-8")
      const keys = JSON.parse(fileContent)
      return NextResponse.json(keys)
    } catch (error) {
      // File doesn't exist or is invalid, return empty keys
      return NextResponse.json({
        openaiApiKey: "",
        anthropicApiKey: "",
      })
    }
  } catch (error) {
    console.error("Failed to load API keys:", error)
    return NextResponse.json(
      { error: "Failed to load API keys" },
      { status: 500 }
    )
  }
}

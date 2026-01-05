"use client"

import { useState, useEffect } from "react"
import { X, Eye, EyeOff } from "lucide-react"
import { Button } from "@ui/lib/ui/button"
import { Label } from "@ui/lib/ui/label"
import { Input } from "@ui/lib/ui/input"
import type { NoteLength } from "@storage/preferences"
import { getApiKeys, setApiKeys, validateApiKey } from "@storage"

interface SettingsDialogProps {
  isOpen: boolean
  onClose: () => void
  noteLength: NoteLength
  onNoteLengthChange: (length: NoteLength) => void
}

export function SettingsDialog({ isOpen, onClose, noteLength, onNoteLengthChange }: SettingsDialogProps) {
  const [openaiKey, setOpenaiKey] = useState("")
  const [anthropicKey, setAnthropicKey] = useState("")
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)
  const [showAnthropicKey, setShowAnthropicKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")

  useEffect(() => {
    if (isOpen) {
      void loadKeys()
    }
  }, [isOpen])

  const loadKeys = async () => {
    try {
      const keys = await getApiKeys()
      setOpenaiKey(keys.openaiApiKey)
      setAnthropicKey(keys.anthropicApiKey)
    } catch (error) {
      console.error("Failed to load API keys:", error)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveMessage("")

    try {
      // Validate keys if provided
      if (openaiKey && !validateApiKey(openaiKey, "openai")) {
        setSaveMessage("Invalid OpenAI API key format")
        setIsSaving(false)
        return
      }

      if (anthropicKey && !validateApiKey(anthropicKey, "anthropic")) {
        setSaveMessage("Invalid Anthropic API key format")
        setIsSaving(false)
        return
      }

      await setApiKeys({
        openaiApiKey: openaiKey,
        anthropicApiKey: anthropicKey,
      })

      setSaveMessage("API keys saved successfully")
      setTimeout(() => {
        setSaveMessage("")
        onClose()
      }, 1500)
    } catch (error) {
      console.error("Failed to save API keys:", error)
      setSaveMessage("Failed to save API keys")
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-background p-8 shadow-2xl border border-border max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">Settings</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-9 w-9 rounded-full p-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        {/* Settings Content */}
        <div className="space-y-6">
          {/* API Keys Section */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">API Keys</h3>
              <p className="text-sm text-muted-foreground">
                Configure your API keys for transcription and note generation
              </p>
            </div>

            {/* OpenAI API Key */}
            <div className="space-y-2">
              <Label htmlFor="openai-key" className="text-sm font-medium text-foreground">
                OpenAI API Key
              </Label>
              <p className="text-xs text-muted-foreground">
                Required for audio transcription (Whisper)
              </p>
              <div className="relative">
                <Input
                  id="openai-key"
                  type={showOpenaiKey ? "text" : "password"}
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-..."
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showOpenaiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Anthropic API Key */}
            <div className="space-y-2">
              <Label htmlFor="anthropic-key" className="text-sm font-medium text-foreground">
                Anthropic API Key
              </Label>
              <p className="text-xs text-muted-foreground">
                Required for clinical note generation (Claude)
              </p>
              <div className="relative">
                <Input
                  id="anthropic-key"
                  type={showAnthropicKey ? "text" : "password"}
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showAnthropicKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Note Length Setting */}
          <div className="space-y-3">
            <Label className="text-base font-medium text-foreground">Note Length</Label>
            <p className="text-sm text-muted-foreground">
              Choose between concise or detailed clinical notes
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => onNoteLengthChange("short")}
                className={`flex-1 rounded-lg border-2 p-4 text-left transition-all ${
                  noteLength === "short"
                    ? "border-foreground bg-accent"
                    : "border-border hover:border-muted-foreground"
                }`}
              >
                <div className="font-medium text-foreground">Short</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Brief, focused documentation
                </div>
              </button>
              <button
                onClick={() => onNoteLengthChange("long")}
                className={`flex-1 rounded-lg border-2 p-4 text-left transition-all ${
                  noteLength === "long"
                    ? "border-foreground bg-accent"
                    : "border-border hover:border-muted-foreground"
                }`}
              >
                <div className="font-medium text-foreground">Long</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Comprehensive, detailed notes
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Save Message */}
        {saveMessage && (
          <div className={`mt-4 text-sm text-center ${saveMessage.includes("success") ? "text-green-600" : "text-red-600"}`}>
            {saveMessage}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  )
}

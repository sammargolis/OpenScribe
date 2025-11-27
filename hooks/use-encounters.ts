"use client"

import useSWR from "swr"
import type { Encounter } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export function useEncounters() {
  const { data: encounters = [], mutate } = useSWR<Encounter[]>("/api/encounters", fetcher)

  const addEncounter = async (data: Partial<Encounter>) => {
    const res = await fetch("/api/encounters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    const newEncounter = await res.json()
    mutate([newEncounter, ...encounters], false)
    return newEncounter
  }

  const update = async (id: string, updates: Partial<Encounter>) => {
    // Optimistic update
    mutate(
      encounters.map((e) => (e.id === id ? { ...e, ...updates } : e)),
      false
    )
    
    await fetch(`/api/encounters/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
    mutate() // Revalidate to get server state
  }

  const remove = async (id: string) => {
    mutate(encounters.filter((e) => e.id !== id), false)
    await fetch(`/api/encounters/${id}`, { method: "DELETE" })
    mutate()
  }

  return {
    encounters,
    addEncounter,
    updateEncounter: update,
    deleteEncounter: remove,
    refresh: mutate,
  }
}

"use client"

import useSWR from "swr"
import type { Encounter } from "@storage/types"
import {
  getEncounters,
  saveEncounters,
  createEncounter,
  updateEncounter,
  deleteEncounter,
} from "@storage/encounters"

export function useEncounters() {
  const { data: encounters = [], mutate } = useSWR<Encounter[]>("encounters", () => getEncounters(), {
    fallbackData: [],
    revalidateOnFocus: false,
  })

  const addEncounter = async (data: Partial<Encounter>) => {
    const newEncounter = createEncounter(data)
    const updated = [newEncounter, ...encounters]
    await saveEncounters(updated)
    await mutate(updated, false)
    return newEncounter
  }

  const update = async (id: string, updates: Partial<Encounter>) => {
    const updated = updateEncounter(encounters, id, updates)
    await saveEncounters(updated)
    await mutate(updated, false)
  }

  const remove = async (id: string) => {
    const updated = deleteEncounter(encounters, id)
    await saveEncounters(updated)
    await mutate(updated, false)
  }

  return {
    encounters,
    addEncounter,
    updateEncounter: update,
    deleteEncounter: remove,
    refresh: mutate,
  }
}

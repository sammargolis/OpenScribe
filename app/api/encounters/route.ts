import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/encounters - Get all encounters
export async function GET() {
  try {
    const encounters = await prisma.encounter.findMany({
      orderBy: {
        created_at: 'desc',
      },
    })
    return NextResponse.json(encounters)
  } catch (error) {
    console.error('Error fetching encounters:', error)
    return NextResponse.json(
      { error: 'Failed to fetch encounters' },
      { status: 500 }
    )
  }
}

// POST /api/encounters - Create a new encounter
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const encounter = await prisma.encounter.create({
      data: {
        patient_name: body.patient_name || '',
        patient_id: body.patient_id || '',
        visit_reason: body.visit_reason || '',
        status: body.status || 'idle',
        language: body.language || 'en',
        transcript_text: body.transcript_text || '',
        note_text: body.note_text || '',
        recording_duration: body.recording_duration,
      },
    })
    return NextResponse.json(encounter, { status: 201 })
  } catch (error) {
    console.error('Error creating encounter:', error)
    return NextResponse.json(
      { error: 'Failed to create encounter' },
      { status: 500 }
    )
  }
}


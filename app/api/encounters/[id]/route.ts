import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/encounters/[id] - Get a specific encounter
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const encounter = await prisma.encounter.findUnique({
      where: { id: params.id },
    })

    if (!encounter) {
      return NextResponse.json(
        { error: 'Encounter not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(encounter)
  } catch (error) {
    console.error('Error fetching encounter:', error)
    return NextResponse.json(
      { error: 'Failed to fetch encounter' },
      { status: 500 }
    )
  }
}

// PATCH /api/encounters/[id] - Update an encounter
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const encounter = await prisma.encounter.update({
      where: { id: params.id },
      data: {
        ...body,
        updated_at: new Date(),
      },
    })
    return NextResponse.json(encounter)
  } catch (error) {
    console.error('Error updating encounter:', error)
    return NextResponse.json(
      { error: 'Failed to update encounter' },
      { status: 500 }
    )
  }
}

// DELETE /api/encounters/[id] - Delete an encounter
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.encounter.delete({
      where: { id: params.id },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting encounter:', error)
    return NextResponse.json(
      { error: 'Failed to delete encounter' },
      { status: 500 }
    )
  }
}


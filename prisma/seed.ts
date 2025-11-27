import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const encounter1 = await prisma.encounter.create({
    data: {
      patient_name: "John Doe",
      patient_id: "PT-12345",
      visit_reason: "Persistent headache and light sensitivity",
      status: "completed",
      transcript_text: "Doctor: How long have you had the headache?\nPatient: About 3 days now. It gets worse with bright lights.",
      note_text: "Chief Complaint:\nPersistent headache\n\nHPI:\nPatient reports 3-day history of headache, exacerbated by photophobia.\n\nPlan:\nRest and hydration.",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
    },
  })

  const encounter2 = await prisma.encounter.create({
    data: {
      patient_name: "Jane Smith",
      patient_id: "PT-67890",
      visit_reason: "Annual checkup",
      status: "idle",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    },
  })

  console.log({ encounter1, encounter2 })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })


/**
 * Seed: Insert award data from spreadsheet into client_success_awards
 * Run with: npx tsx src/scripts/seedAwards.ts
 */

import * as path from "path"
import { fileURLToPath } from "url"
import { config } from "dotenv"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const envPath = path.resolve(__dirname, "..", "..", ".env")
config({ path: envPath })

const { initializeDatabase, db } = await import("../db/index.js")
const { sql } = await import("drizzle-orm")

const awards = [
  {
    name: "Website",
    company_name: "Hawkeye Community College",
    issuing_agency: "NCMPR",
    category: "Website",
    award_level: "Gold",
    year: "2025",
    submission_status: "client-submission",
  },
  {
    name: "Campaign",
    company_name: "IU Simon Comprehensive Cancer Center",
    issuing_agency: "Healthcare AdAward",
    category: "Campaign",
    award_level: "Merit",
    year: "2025",
    badge_storage_key: "IUSCCC-42nd-HealthcareAdAwards-Merit-Winners-Badge-Color",
    submission_status: "stamats-submission",
  },
  {
    name: "eBook",
    company_name: "Visiting Angels",
    issuing_agency: "Digital Health Awards",
    category: "eBook",
    award_level: "Merit",
    year: "Spring 2025",
    badge_storage_key: "Digital Health Awards Spring 2025",
    submission_status: "stamats-submission",
  },
  {
    name: "Blog",
    company_name: "UT Southwestern MedBlog",
    issuing_agency: "Digital Health Awards",
    category: "Blog",
    award_level: "Bronze",
    year: "Spring 2025",
    submission_status: "stamats-submission",
  },
  {
    name: "Open Enrollment Online",
    company_name: "BeWell (NM Health Insurance Marketplace)",
    issuing_agency: "Digital Health Awards",
    category: "Open Enrollment Online",
    award_level: "Gold",
    year: "Spring 2025",
    submission_status: "stamats-submission",
  },
  {
    name: "Open Enrollment Campaign",
    company_name: "BeWell (NM Health Insurance Marketplace)",
    issuing_agency: "Digital Health Awards",
    category: "Open Enrollment Campaign",
    award_level: "Gold",
    year: "Spring 2025",
    submission_status: "stamats-submission",
  },
  {
    name: "Scheduling Tool",
    company_name: "BeWell (NM Health Insurance Marketplace)",
    issuing_agency: "Digital Health Awards",
    category: "Scheduling tool",
    award_level: "Silver",
    year: "Spring 2025",
    submission_status: "stamats-submission",
  },
  {
    name: "Rebrand",
    company_name: "BeWell (NM Health Insurance Marketplace)",
    issuing_agency: "Digital Health Awards",
    category: "Rebrand",
    award_level: "Bronze",
    year: "Spring 2025",
    submission_status: "stamats-submission",
  },
  {
    name: "Digital Health Media/Publications - Blog Post",
    company_name: "UT Southwestern MedBlog",
    issuing_agency: "Digital Health Awards",
    category: "Digital Health Media/Publications - Blog Post",
    award_level: "Merit",
    year: "Fall 2025",
    badge_storage_key: "f2025_dha_winner_print.jpg",
  },
  {
    name: "Science Storytelling + Website Redesign",
    company_name: "IU Simon Comprehensive Cancer Center",
    issuing_agency: "Digital Health Awards",
    category: "Science Storytelling + Website Redesign",
    award_level: "Merit",
    year: "Fall 2025",
  },
  {
    name: "Community Health Newsletter",
    company_name: "Houston Methodist Leading Medicine",
    issuing_agency: "Digital Health Awards",
    category: "Community Health Newsletter",
    award_level: "Merit",
    year: "Fall 2025",
  },
  {
    name: "Digital Special Video: Under 2 Min",
    company_name: "Mid Michigan College",
    issuing_agency: "Education Digital Marketing Awards",
    category: "Digital Spcl Video: under 2 min",
    award_level: "Gold",
    year: "2025",
    badge_storage_key: "13th-EducationDigitalMarketingAwards-Gold-Winners-Badge.png",
    submission_status: "stamats-submission",
  },
  {
    name: "Digital Advertising",
    company_name: "Owens Community College",
    issuing_agency: "Education Digital Marketing Awards",
    category: "Digital Advertising",
    award_level: "Gold",
    year: "2025",
    submission_status: "stamats-submission",
  },
  {
    name: "Digital Advertising",
    company_name: "University of Southern Maine",
    issuing_agency: "Education Digital Marketing Awards",
    category: "Digital Advertising",
    award_level: "Gold",
    year: "2025",
    submission_status: "stamats-submission",
  },
  {
    name: "Blogs",
    company_name: "Harper College",
    issuing_agency: "Education Digital Marketing Awards",
    category: "Blogs",
    award_level: "Gold",
    year: "2024",
    submission_status: "stamats-submission",
  },
  {
    name: "Institutional Website",
    company_name: "Mid Michigan College",
    issuing_agency: "Education Digital Marketing Awards",
    category: "Institutional Website",
    award_level: "Silver",
    year: "2024",
    submission_status: "stamats-submission",
  },
  {
    name: "Institutional Website Update/Refresh",
    company_name: "Morehead State University",
    issuing_agency: "Education Digital Marketing Awards",
    category: "Institutional Website-Update/Refresh",
    award_level: "Gold",
    year: "2023",
    submission_status: "stamats-submission",
  },
  {
    name: "Institutional Website Update/Refresh",
    company_name: "University of Florida",
    issuing_agency: "Education Digital Marketing Awards",
    category: "Institutional Website-Update/Refresh",
    award_level: "Gold",
    year: "2023",
    submission_status: "stamats-submission",
  },
  {
    name: "Newsletter/External-Series",
    company_name: "Houston Methodist (Leading Medicine)",
    issuing_agency: "Aster Awards",
    category: "Newsletter/External-Series",
    award_level: "Gold",
    year: "2025",
    submission_status: "stamats-submission",
  },
]

async function main() {
  await initializeDatabase()

  console.log(`Seeding ${awards.length} awards...`)

  for (const a of awards) {
    const name = a.name
    const year = a.year
    const company = a.company_name
    const agency = a.issuing_agency ?? null
    const category = a.category ?? null
    const level = a.award_level ?? null
    const status = (a as any).submission_status ?? null
    const badge = (a as any).badge_storage_key ?? null

    await db!.execute(sql`
      INSERT INTO client_success_awards
        (name, year, client_or_project, company_name, issuing_agency, category, award_level, submission_status, badge_storage_key)
      VALUES
        (${name}, ${year}, ${company}, ${company}, ${agency}, ${category}, ${level}, ${status}, ${badge})
    `)
    console.log(`  ✓ ${company} — ${name} (${year})`)
  }

  console.log("Done.")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

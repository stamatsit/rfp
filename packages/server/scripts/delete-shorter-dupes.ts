import postgres from 'postgres';
import fs from 'fs';

const sql = postgres(process.env.DATABASE_URL as string);

async function run() {
  // Count before
  const before = await sql`SELECT count(*) FROM answer_items`;
  console.log('Entries BEFORE:', before[0].count);

  // Find all same-question groups, keep longest answer, delete the rest
  const groups = await sql`
    SELECT question,
           array_agg(id ORDER BY length(answer) DESC, created_at ASC) as ids,
           array_agg(length(answer) ORDER BY length(answer) DESC, created_at ASC) as lengths,
           array_agg((SELECT display_name FROM topics WHERE id = a.topic_id) ORDER BY length(answer) DESC, created_at ASC) as topics
    FROM answer_items a
    GROUP BY question
    HAVING count(*) > 1
    ORDER BY count(*) DESC
  `;

  console.log('Same-question groups:', groups.length);

  const toDelete: string[] = [];
  const backupData: any[] = [];

  for (const g of groups) {
    const keepId = g.ids[0]; // longest answer
    for (let i = 1; i < g.ids.length; i++) {
      toDelete.push(g.ids[i]);
      backupData.push({
        id: g.ids[i],
        question: g.question,
        topic: g.topics[i],
        answerLength: g.lengths[i],
        keptId: keepId,
        keptTopic: g.topics[0],
        keptAnswerLength: g.lengths[0],
      });
    }
  }

  console.log('Entries to delete:', toDelete.length);
  console.log('Entries to keep:', groups.length);

  // Backup
  const backupPath = 'same-question-dups-backup-2026-02-18.json';
  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
  console.log('Backup saved to:', backupPath);

  // Also backup full answer text for the entries being deleted
  const fullBackup = await sql`
    SELECT id, question, answer, topic_id, subtopic, status, tags, fingerprint, created_at, updated_at
    FROM answer_items
    WHERE id = ANY(${toDelete})
  `;
  const fullBackupPath = 'same-question-dups-full-backup-2026-02-18.json';
  fs.writeFileSync(fullBackupPath, JSON.stringify(fullBackup, null, 2));
  console.log('Full backup saved to:', fullBackupPath);
  console.log('Full backup size:', (fs.statSync(fullBackupPath).size / 1024).toFixed(1) + ' KB');

  // Clean up related tables
  const versions = await sql`DELETE FROM answer_item_versions WHERE answer_item_id = ANY(${toDelete})`;
  console.log('Deleted versions:', versions.count);
  const links = await sql`DELETE FROM links_answer_photo WHERE answer_item_id = ANY(${toDelete})`;
  console.log('Deleted photo links:', links.count);

  // Delete
  const result = await sql`DELETE FROM answer_items WHERE id = ANY(${toDelete})`;
  console.log('Deleted entries:', result.count);

  // Verify
  const after = await sql`SELECT count(*) FROM answer_items`;
  console.log('\nEntries AFTER:', after[0].count);

  const remaining = await sql`
    SELECT count(*) FROM (
      SELECT question FROM answer_items GROUP BY question HAVING count(*) > 1
    ) sub
  `;
  console.log('Same-question groups remaining:', remaining[0].count);

  await sql.end();
}

run().catch(e => { console.error(e); process.exit(1); });

const http = require('http');

http.get('http://localhost:3001/api/search?type=answers', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const answers = json.answers;
    console.log('Total answers:', answers.length);

    // Check for EXACT duplicates (same question AND answer)
    const exactMap = new Map();
    answers.forEach(a => {
      const key = (a.question.trim() + '|||' + a.answer.trim()).toLowerCase();
      if (!exactMap.has(key)) exactMap.set(key, []);
      exactMap.get(key).push(a);
    });

    const exactDupes = [...exactMap.entries()].filter(([k, arr]) => arr.length > 1);
    console.log('\nEXACT duplicates (same question AND answer):', exactDupes.length);
    const exactDupeRecords = exactDupes.reduce((sum, [k, arr]) => sum + arr.length - 1, 0);
    console.log('Records that could be removed:', exactDupeRecords);

    // Check for question-only duplicates (same question, different answer)
    const questionMap = new Map();
    answers.forEach(a => {
      const q = a.question.trim().toLowerCase();
      if (!questionMap.has(q)) questionMap.set(q, []);
      questionMap.get(q).push(a);
    });

    const questionDupes = [...questionMap.entries()].filter(([q, arr]) => arr.length > 1);

    // Find which question dupes have DIFFERENT answers
    let differentAnswerCount = 0;
    const differentAnswerExamples = [];

    questionDupes.forEach(([q, arr]) => {
      const uniqueAnswers = new Set(arr.map(a => a.answer.trim().toLowerCase()));
      if (uniqueAnswers.size > 1) {
        differentAnswerCount++;
        if (differentAnswerExamples.length < 5) {
          differentAnswerExamples.push({
            question: q.substring(0, 60),
            count: arr.length,
            uniqueAnswers: uniqueAnswers.size
          });
        }
      }
    });

    console.log('\nSame question but DIFFERENT answers:', differentAnswerCount);

    if (differentAnswerExamples.length > 0) {
      console.log('\nExamples of questions with different answers:');
      differentAnswerExamples.forEach(ex => {
        console.log('  "' + ex.question + '..." - ' + ex.count + ' records, ' + ex.uniqueAnswers + ' unique answers');
      });
    }

    console.log('\n--- Summary ---');
    console.log('Total duplicate questions:', questionDupes.length);
    console.log('Exact duplicates (safe to remove):', exactDupes.length, '(' + exactDupeRecords + ' records)');
    console.log('Different answers (need review):', differentAnswerCount);
  });
}).on('error', err => console.error('Error:', err));

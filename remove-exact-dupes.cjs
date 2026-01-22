const http = require('http');

http.get('http://localhost:3001/api/search?type=answers', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const answers = json.answers;
    console.log('Total answers:', answers.length);

    // Find EXACT duplicates (same question AND answer)
    const exactMap = new Map();
    answers.forEach(a => {
      const key = (a.question.trim() + '|||' + a.answer.trim()).toLowerCase();
      if (!exactMap.has(key)) exactMap.set(key, []);
      exactMap.get(key).push(a);
    });

    const exactDupes = [...exactMap.entries()].filter(([k, arr]) => arr.length > 1);

    // Collect IDs to delete (keep the newest one, delete the rest)
    const idsToDelete = [];
    exactDupes.forEach(([key, arr]) => {
      // Sort by createdAt descending (newest first)
      arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      // Keep the first (newest), delete the rest
      for (let i = 1; i < arr.length; i++) {
        idsToDelete.push(arr[i].id);
        console.log('Will delete:', arr[i].id, '-', arr[i].question.substring(0, 50) + '...');
      }
    });

    console.log('\nDeleting', idsToDelete.length, 'exact duplicates...\n');

    // Delete each one
    let deleted = 0;
    let errors = 0;

    const deleteNext = (index) => {
      if (index >= idsToDelete.length) {
        console.log('\nDone! Deleted:', deleted, 'Errors:', errors);
        return;
      }

      const id = idsToDelete[index];
      const req = http.request({
        hostname: 'localhost',
        port: 3001,
        path: '/api/answers/' + id,
        method: 'DELETE'
      }, (res) => {
        if (res.statusCode === 200 || res.statusCode === 204) {
          deleted++;
          console.log('Deleted:', id);
        } else {
          errors++;
          console.log('Error deleting:', id, 'Status:', res.statusCode);
        }
        deleteNext(index + 1);
      });

      req.on('error', (e) => {
        errors++;
        console.log('Error deleting:', id, e.message);
        deleteNext(index + 1);
      });

      req.end();
    };

    if (idsToDelete.length > 0) {
      deleteNext(0);
    } else {
      console.log('No exact duplicates to delete!');
    }
  });
}).on('error', err => console.error('Error:', err));

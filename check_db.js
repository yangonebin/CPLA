const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./checklist.db', (err) => {
    if (err) {
        console.error('DB 연결 실패:', err);
        process.exit(1);
    }
});

db.all('SELECT * FROM keywords ORDER BY exam_id, subject', [], (err, rows) => {
    if (err) {
        console.error('조회 실패:', err);
        process.exit(1);
    }

    console.log('\n=== 저장된 키워드 데이터 ===\n');
    if (rows.length === 0) {
        console.log('데이터가 없습니다.\n');
    } else {
        rows.forEach(row => {
            console.log(`시험: ${row.exam_id}`);
            console.log(`과목: ${row.subject}`);
            console.log(`키워드 수: ${row.keywords ? row.keywords.split('\n').filter(k => k.trim()).length : 0}`);
            console.log(`키워드 미리보기: ${row.keywords ? row.keywords.substring(0, 100) : '없음'}`);
            console.log('---\n');
        });
    }

    db.close();
});

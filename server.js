const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('.'));

// SQLite 데이터베이스 초기화
const db = new sqlite3.Database('./checklist.db', (err) => {
    if (err) {
        console.error('DB 연결 실패:', err);
    } else {
        console.log('DB 연결 성공');
        db.run(`CREATE TABLE IF NOT EXISTS checklist (
            id TEXT PRIMARY KEY,
            checked INTEGER
        )`);
    }
});

// 체크리스트 데이터 불러오기
app.get('/api/checklist', (req, res) => {
    db.all('SELECT * FROM checklist', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        const data = {};
        rows.forEach(row => {
            data[row.id] = row.checked === 1;
        });
        res.json(data);
    });
});

// 체크리스트 데이터 저장하기
app.post('/api/checklist', (req, res) => {
    const data = req.body;

    db.serialize(() => {
        const stmt = db.prepare('INSERT OR REPLACE INTO checklist (id, checked) VALUES (?, ?)');
        for (const [id, checked] of Object.entries(data)) {
            stmt.run(id, checked ? 1 : 0);
        }
        stmt.finalize();
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`서버 실행중: http://localhost:${PORT}`);
});

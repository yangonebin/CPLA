const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'nomusa-secret-key-2025',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24시간
}));
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

// 로그인 상태 확인
app.get('/api/auth/status', (req, res) => {
    res.json({
        loggedIn: req.session.user === 'yangonebin',
        username: req.session.user || null
    });
});

// 로그인
app.post('/api/auth/login', (req, res) => {
    const { username } = req.body;

    if (username === 'yangonebin') {
        req.session.user = username;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: '로그인 실패' });
    }
});

// 로그아웃
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// 체크리스트 데이터 저장하기 (로그인 필요)
app.post('/api/checklist', (req, res) => {
    if (req.session.user !== 'yangonebin') {
        return res.status(403).json({ success: false, message: '권한 없음' });
    }

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

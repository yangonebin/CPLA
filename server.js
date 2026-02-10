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
        db.run(`CREATE TABLE IF NOT EXISTS keywords (
            exam_id TEXT,
            subject TEXT,
            keywords TEXT,
            PRIMARY KEY (exam_id, subject)
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

// 키워드 불러오기
app.get('/api/keywords/:examId', (req, res) => {
    const examId = req.params.examId;
    const subject = req.query.subject || '전체';

    db.get('SELECT keywords FROM keywords WHERE exam_id = ? AND subject = ?', [examId, subject], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ keywords: row ? row.keywords : '' });
    });
});

// 키워드 저장 (로그인 필요)
app.post('/api/keywords/:examId', (req, res) => {
    if (req.session.user !== 'yangonebin') {
        return res.status(403).json({ success: false, message: '권한 없음' });
    }

    const examId = req.params.examId;
    const subject = req.body.subject || '전체';
    const keywords = req.body.keywords;

    db.run('INSERT OR REPLACE INTO keywords (exam_id, subject, keywords) VALUES (?, ?, ?)',
        [examId, subject, keywords],
        (err) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true });
        }
    );
});

// 다개년 통합 키워드 조회
app.get('/api/keywords/multi-year', (req, res) => {
    const examType = req.query.examType; // '1st' or '2nd'
    const subject = req.query.subject || '전체';
    const years = parseInt(req.query.years) || 3;
    const baseYear = parseInt(req.query.baseYear); // 기준 연도

    if (!baseYear) {
        return res.status(400).json({ error: 'baseYear is required' });
    }

    // 기준 연도부터 과거로 N년
    const startYear = baseYear - years + 1;
    const endYear = baseYear;

    // examIds 생성 (예: 2018-1st, 2019-1st, 2020-1st)
    const examIds = [];
    for (let year = startYear; year <= endYear; year++) {
        examIds.push(`${year}-${examType}`);
    }

    // SQL 쿼리 생성
    const placeholders = examIds.map(() => '?').join(',');
    const query = `
        SELECT exam_id, keywords
        FROM keywords
        WHERE exam_id IN (${placeholders})
        AND subject = ?
    `;

    db.all(query, [...examIds, subject], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        // 통합 키워드 데이터 생성
        const mergedData = {};
        const yearData = {};

        rows.forEach(row => {
            if (row.keywords) {
                const keywords = row.keywords.split('\n');
                yearData[row.exam_id] = keywords.length;

                keywords.forEach(keyword => {
                    const trimmed = keyword.trim();
                    if (trimmed) {
                        mergedData[trimmed] = (mergedData[trimmed] || 0) + 1;
                    }
                });
            }
        });

        res.json({
            examIds: examIds,
            subject: subject,
            yearRange: `${startYear}-${endYear}`,
            mergedKeywords: mergedData,
            yearData: yearData
        });
    });
});

app.listen(PORT, () => {
    console.log(`서버 실행중: http://localhost:${PORT}`);
});

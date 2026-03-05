const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const https = require('https');

const GITHUB_REPO = 'yangonebin/CPLA';
const GITHUB_FILE = 'checklist.db';

function githubRequest(method, apiPath, body, token) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = https.request({
            hostname: 'api.github.com',
            path: apiPath,
            method,
            headers: {
                'Authorization': `token ${token}`,
                'User-Agent': 'cpla-app',
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

const app = express();
const PORT = process.env.PORT || 3000;

// Railway Volume 사용 (영구 저장)
// Railway에서 Volume을 /data로 마운트하는 경우
const DB_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'checklist.db')
    : './checklist.db';

console.log('📁 데이터베이스 경로:', DB_PATH);

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
let db = new sqlite3.Database(DB_PATH, (err) => {
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
        db.run(`CREATE TABLE IF NOT EXISTS exam_dates (
            exam_type TEXT PRIMARY KEY,
            exam_date TEXT,
            label TEXT
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

// 시험 날짜 조회
app.get('/api/exam-dates', (req, res) => {
    db.all('SELECT * FROM exam_dates', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        const result = {};
        rows.forEach(row => {
            result[row.exam_type] = { date: row.exam_date, label: row.label };
        });
        res.json(result);
    });
});

// 시험 날짜 저장 (로그인 필요)
app.post('/api/exam-dates', (req, res) => {
    if (req.session.user !== 'yangonebin') {
        return res.status(403).json({ success: false, message: '권한 없음' });
    }

    const { exam_type, exam_date, label } = req.body;

    db.run('INSERT OR REPLACE INTO exam_dates (exam_type, exam_date, label) VALUES (?, ?, ?)',
        [exam_type, exam_date, label],
        (err) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true });
        }
    );
});

// 시험 날짜 삭제 (로그인 필요)
app.delete('/api/exam-dates/:examType', (req, res) => {
    if (req.session.user !== 'yangonebin') {
        return res.status(403).json({ success: false, message: '권한 없음' });
    }

    db.run('DELETE FROM exam_dates WHERE exam_type = ?', [req.params.examType], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true });
    });
});

// 다개년 통합 키워드 조회 (이 라우트를 :examId보다 먼저 정의해야 함)
app.get('/api/keywords/multi-year', (req, res) => {
    const examType = req.query.examType; // '1st' or '2nd'
    const subject = req.query.subject || '전체';
    const years = parseInt(req.query.years) || 3;
    const baseYear = parseInt(req.query.baseYear); // 기준 연도

    console.log('🔍 다개년 조회 요청:', { examType, subject, years, baseYear });

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

    console.log('📅 검색할 시험:', examIds);

    // SQL 쿼리 생성
    const placeholders = examIds.map(() => '?').join(',');
    let query, queryParams;

    if (subject === '전체') {
        // "전체" 선택 시: 모든 과목 통합 (단, "전체"라는 이름의 과목 제외)
        query = `
            SELECT exam_id, subject, keywords
            FROM keywords
            WHERE exam_id IN (${placeholders})
            AND subject != ?
        `;
        queryParams = [...examIds, '전체'];
    } else {
        // 특정 과목 선택 시
        query = `
            SELECT exam_id, keywords
            FROM keywords
            WHERE exam_id IN (${placeholders})
            AND subject = ?
        `;
        queryParams = [...examIds, subject];
    }

    db.all(query, queryParams, (err, rows) => {
        if (err) {
            console.error('❌ DB 조회 실패:', err);
            res.status(500).json({ error: err.message });
            return;
        }

        console.log(`📦 DB에서 찾은 데이터: ${rows.length}개`);
        rows.forEach(row => {
            console.log(`  - ${row.exam_id} (${subject}): ${row.keywords ? row.keywords.split('\n').filter(k => k.trim()).length : 0}개 키워드`);
        });

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

        console.log(`✅ 통합 완료: 총 ${Object.keys(mergedData).length}개 고유 키워드`);

        res.json({
            examIds: examIds,
            subject: subject,
            yearRange: `${startYear}-${endYear}`,
            mergedKeywords: mergedData,
            yearData: yearData
        });
    });
});

// 키워드 불러오기
app.get('/api/keywords/:examId', (req, res) => {
    const examId = req.params.examId;
    const subject = req.query.subject || '전체';

    if (subject === '전체') {
        // "전체" 선택 시: 해당 시험의 모든 과목 데이터를 통합
        db.all('SELECT keywords FROM keywords WHERE exam_id = ? AND subject != ?', [examId, '전체'], (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }

            // 모든 과목의 키워드를 합침
            const allKeywords = rows.map(row => row.keywords).filter(k => k).join('\n');
            res.json({ keywords: allKeywords, isAggregated: true });
        });
    } else {
        // 특정 과목 선택 시
        db.get('SELECT keywords FROM keywords WHERE exam_id = ? AND subject = ?', [examId, subject], (err, row) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ keywords: row ? row.keywords : '', isAggregated: false });
        });
    }
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

// DB 파일 업로드 복구 (로그인 필요)
const multer = require('multer');
const upload = multer({ dest: '/tmp/' });

app.post('/api/restore', upload.single('db'), (req, res) => {
    if (req.session.user !== 'yangonebin') {
        return res.status(403).json({ success: false, message: '로그인 필요' });
    }
    if (!req.file) {
        return res.status(400).json({ success: false, message: '파일 없음' });
    }
    db.close(() => {
        fs.copyFileSync(req.file.path, DB_PATH);
        fs.unlinkSync(req.file.path);
        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) res.status(500).json({ success: false, message: 'DB 재연결 실패' });
            else res.json({ success: true, message: 'DB 복구 완료!' });
        });
    });
});

// DB 저장하기 - GitHub에 push (로그인 필요)
app.post('/api/db/push', async (req, res) => {
    if (req.session.user !== 'yangonebin') {
        return res.status(403).json({ success: false, message: '로그인 필요' });
    }
    const token = process.env.GITHUB_TOKEN;
    if (!token) return res.status(500).json({ success: false, message: 'GITHUB_TOKEN 없음' });

    try {
        const content = fs.readFileSync(DB_PATH).toString('base64');
        const apiPath = `/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

        // 기존 파일 SHA 조회 (업데이트 시 필요)
        const { status: getStatus, data: fileInfo } = await githubRequest('GET', apiPath, null, token);
        const sha = getStatus === 200 ? fileInfo.sha : undefined;

        const body = { message: 'DB 업데이트', content, ...(sha ? { sha } : {}) };
        const { status } = await githubRequest('PUT', apiPath, body, token);

        if (status === 200 || status === 201) {
            res.json({ success: true });
        } else {
            res.status(500).json({ success: false, message: 'GitHub 저장 실패' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DB 가져오기 - GitHub에서 pull (로그인 불필요)
app.post('/api/db/pull', async (req, res) => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return res.status(500).json({ success: false, message: 'GITHUB_TOKEN 없음' });

    try {
        const { status, data: fileInfo } = await githubRequest('GET', `/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`, null, token);

        if (status !== 200) {
            return res.status(404).json({ success: false, message: 'GitHub에 저장된 DB가 없습니다. 먼저 로그인 후 저장하세요.' });
        }

        const fileBuffer = Buffer.from(fileInfo.content.replace(/\n/g, ''), 'base64');
        db.close(() => {
            fs.writeFileSync(DB_PATH, fileBuffer);
            db = new sqlite3.Database(DB_PATH, (err) => {
                if (err) {
                    res.status(500).json({ success: false, message: 'DB 재연결 실패' });
                } else {
                    res.json({ success: true });
                }
            });
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`서버 실행중: http://localhost:${PORT}`);
});

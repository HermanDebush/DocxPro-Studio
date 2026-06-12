

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { runUserCode } = require('./sandbox');
const { convertToPdf } = require('./converter');
const { checkSystem } = require('./diagnostics');
const { processCode } = require('./autofix');

const app = express();

function safeUnlink(p) {
    try { if (p) fs.unlinkSync(p); } catch (e) {}
}

app.use(bodyParser.json({ limit: '50mb' }));

// Папку интерфейса ищем рядом с exe (в pkg-сборке), а в dev — на уровень выше src/.
// Раньше путь брался от process.cwd(), из-за чего при запуске через ярлык или
// лаунчер (с чужой рабочей директорией) интерфейс не находился и приложение
// «не работало», хотя сервер стартовал.
const baseDir = process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
const publicPath = path.join(baseDir, 'public');
console.log(">>> Public folder path:", publicPath);
app.use(express.static(publicPath));

// Версия приложения (package.json в pkg-сборке лежит внутри снапшота).
let APP_VERSION = '0.0.0';
try { APP_VERSION = require('../package.json').version || APP_VERSION; } catch (e) {}

// Официальная ли это установка (через Центр обновлений СНН).
// Лаунчер пишет %APPDATA%\SNN\Launcher\installed.json с записью об установленном
// приложении и путём к exe. Если записи нет либо путь не совпадает с текущим exe
// (копия с GitHub / ручная установка) — копия считается неофициальной и в UI
// показывается напоминание про лаунчер.
function isOfficialInstall() {
    try {
        // Запуск из исходника (node index.js, не pkg-сборка) — это среда
        // разработчика, а не распространяемая копия: плашку «локального режима»
        // показывать незачем, считаем официальной.
        if (!process.pkg) return true;

        const appdata = process.env.APPDATA;
        if (!appdata) return false;
        const p = path.join(appdata, 'SNN', 'Launcher', 'installed.json');
        if (!fs.existsSync(p)) return false;
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        const rec = data['docxpro-studio'];
        if (!rec) return false;
        if (rec.path) {
            const a = path.normalize(rec.path).toLowerCase();
            const b = path.normalize(process.execPath).toLowerCase();
            return a === b;
        }
        return true; // запись есть, путь не указан — считаем официальной
    } catch (e) {
        return false;
    }
}

// Метаданные для фронта: официальность установки и версия.
app.get('/api/meta', (req, res) => {
    res.json({ official: isOfficialInstall(), version: APP_VERSION });
});

// Лёгкий heartbeat. Фронт пингует его раз в пару секунд; как только сервер
// перестаёт отвечать (приложение закрыто из лаунчера, краш или ручная
// остановка) — в браузере показывается экран «Приложение закрыто».
app.get('/api/ping', (req, res) => {
    res.json({ ok: true });
});

app.post('/api/run', async (req, res) => {
    console.log(`>>> ПОЛУЧЕН ЗАПРОС. Формат: ${req.body.format}`);

    try {
        let { code, format, autofix } = req.body;

        if (autofix) {
            console.log(">>> Auto-Fix включен. Исправляю код...");
            const fixResult = processCode(code);
            code = fixResult.fixedCode;
            if (fixResult.errors.length > 0) {
                console.log("   Найдены ошибки при автофиксе:", fixResult.errors);
            }
        }

        const outputDir = path.join(os.homedir(), 'Documents', 'DocxPro_Output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        console.log("1. Генерирую DOCX в:", outputDir);
        const docxPath = await runUserCode(code, outputDir);
        console.log("   DOCX готов:", docxPath);

        if (format === 'pdf') {
            console.log("2. Начинаю конвертацию в PDF...");
            try {
                const pdfPath = await convertToPdf(docxPath, outputDir);
                console.log("   PDF готов, отправляю клиенту.");
                res.download(pdfPath, () => { safeUnlink(pdfPath); safeUnlink(docxPath); });
            } catch (e) {
                console.error("!!! ОШИБКА PDF:", e.message);
                console.log("   Отправляю DOCX вместо PDF.");
                res.download(docxPath, () => { safeUnlink(docxPath); });
            }
        } else {
            console.log("2. Отправляю DOCX клиенту.");
            res.download(docxPath, () => { safeUnlink(docxPath); });
        }

    } catch (err) {
        console.error("!!! КРИТИЧЕСКАЯ ОШИБКА:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/validate', (req, res) => {
    try {
        const { code } = req.body;
        const result = processCode(code);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/check', async (req, res) => {
    console.log(">>> Запуск диагностики Word...");
    try {
        const result = await checkSystem();
        console.log("   Результат:", result.wordStatus);
        res.json(result);
    } catch (err) {
        console.error("!!! Ошибка диагностики:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = app;
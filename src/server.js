/*
 * ==========================================================================
 * СНН PROJECT | Союз Независимых Наработок
 * ==========================================================================
 * Website:   https://snnproject.ru
 * Developer: Herman
 * License:   СНН Private License
 * --------------------------------------------------------------------------
 * Description: Backend Server
 * ==========================================================================
 */

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

app.use(bodyParser.json({ limit: '50mb' }));

// FIX: Use process.cwd() for pkg compatibility
// Если запуск из EXE (pkg), то __dirname внутри snapshot, поэтому берем process.cwd()
const publicPath = path.join(process.cwd(), 'public');
console.log(">>> Public folder path:", publicPath);
app.use(express.static(publicPath));

app.post('/api/run', async (req, res) => {
    console.log(`>>> ПОЛУЧЕН ЗАПРОС. Формат: ${req.body.format}`);

    try {
        let { code, format, autofix } = req.body;

        // Если включен автофикс, прогоняем код через processCode
        if (autofix) {
            console.log(">>> Auto-Fix включен. Исправляю код...");
            const fixResult = processCode(code);
            code = fixResult.fixedCode;
            if (fixResult.errors.length > 0) {
                console.log("   Найдены ошибки при автофиксе:", fixResult.errors);
            }
        }

        // FIX: Don't write to process.cwd() (Program Files is read-only)
        // Write to My Documents instead
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
                res.download(pdfPath);
            } catch (e) {
                console.error("!!! ОШИБКА PDF:", e.message);
                console.log("   Отправляю DOCX вместо PDF.");
                res.download(docxPath);
            }
        } else {
            console.log("2. Отправляю DOCX клиенту.");
            res.download(docxPath);
        }

    } catch (err) {
        console.error("!!! КРИТИЧЕСКАЯ ОШИБКА:", err.message);
        res.status(500).json({ error: err.message, stack: err.stack });
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
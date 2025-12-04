/*
 * ==========================================================================
 * SNN PROJECT | Союз Независимых Наработок
 * ==========================================================================
 * Website:   https://snnproject.ru
 * Developer: Herman
 * License:   SNN Private License
 * --------------------------------------------------------------------------
 * Description: Code Analysis & Autofix
 * ==========================================================================
 */

const vm = require('vm');

const ALL_MODULES = [
    'Document', 'Packer', 'Paragraph', 'TextRun', 'AlignmentType',
    'HeadingLevel', 'LevelFormat', 'TabStopType', 'BorderStyle',
    'PageBreak', 'Header', 'Footer', 'ImageRun', 'Table',
    'TableRow', 'TableCell', 'VerticalAlign', 'WidthType', 'PageNumber'
];

function checkSyntax(code) {
    try {
        new vm.Script(code);
        return null;
    } catch (err) {
        return {
            line: err.stack.split('\n')[0],
            message: err.message
        };
    }
}

function analyzeCode(code) {
    const errors = [];
    const warnings = [];

    // 1. Проверка на создание документа
    if (!code.includes('new Document') && !code.includes('docx.Document')) {
        errors.push("Код не создает документ (нет `new Document`).");
    }

    // 2. Проверка на сохранение (Packer)
    if (!code.includes('Packer.toBuffer') && !code.includes('Packer.toBlob')) {
        errors.push("Код не упаковывает документ (нет `Packer.toBuffer`).");
    }

    // 3. Проверка на запись файла
    if (!code.includes('fs.writeFileSync') && !code.includes('fs.writeFile')) {
        errors.push("Код не сохраняет файл на диск (нет `fs.writeFileSync`).");
    }

    // 4. Проверка на импорт docx
    if (!code.includes("require('docx')") && (code.includes('new Document') || code.includes('docx.Document'))) {
        warnings.push("Нет импорта `docx`. Он будет добавлен автоматически, но лучше добавить `const { ... } = require('docx');`.");
    }

    // 5. Проверка на опечатки (new document вместо new Document)
    if (code.includes('new document')) {
        errors.push("Возможно, опечатка: `new document`. Классы docx пишутся с большой буквы: `new Document`.");
    }

    // 6. Проверка на устаревший синтаксис Paragraph
    if (/new Paragraph\s*\(\s*['"`]/.test(code)) {
        warnings.push("`new Paragraph('текст')` — это старый синтаксис. Используйте `new Paragraph({ children: [ new TextRun('текст') ] })`.");
    }

    // 7. Построчный анализ
    const lines = code.split('\n');
    lines.forEach((line, index) => {
        const trimmed = line.trim();

        // А. Поиск одиноких слов (мусор)
        if (/^[a-zA-Zа-яА-ЯёЁ_$][a-zA-Z0-9а-яА-ЯёЁ_$]*;?$/.test(trimmed)) {
            const word = trimmed.replace(';', '');
            const keywords = ['break', 'continue', 'debugger', 'return'];
            if (!keywords.includes(word)) {
                warnings.push(`Строка ${index + 1}: "${word}" выглядит как опечатка или лишний код.`);
            }
        }

        // Б. Поиск кириллицы вне комментариев и строк
        // Удаляем комментарии
        const noComments = line.split('//')[0];
        // Удаляем строки (простая эвристика: удаляем всё между кавычками)
        const noStrings = noComments.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '');

        if (/[а-яА-ЯёЁ]/.test(noStrings)) {
            warnings.push(`Строка ${index + 1}: Обнаружена кириллица вне кавычек. Проверьте имена переменных.`);
        }
    });

    if (!code.trim()) {
        warnings.push("Код пустой.");
    }

    return { errors, warnings };
}

function fixImports(userCode) {
    let fixedCode = userCode;

    if (!fixedCode.includes("require('docx')")) {
        const imports = `const { ${ALL_MODULES.join(', ')} } = require('docx');\n`;
        fixedCode = imports + fixedCode;
    }

    if ((fixedCode.includes('fs.') || fixedCode.includes('writeFileSync')) && !fixedCode.includes("require('fs')")) {
        fixedCode = `const fs = require('fs');\n` + fixedCode;
    }

    if ((fixedCode.includes('path.') || fixedCode.includes('join(')) && !fixedCode.includes("require('path')")) {
        fixedCode = `const path = require('path');\n` + fixedCode;
    }

    return fixedCode;
}

function processCode(code) {
    const syntaxError = checkSyntax(code);
    if (syntaxError) {
        return {
            fixedCode: code,
            errors: [`Синтаксическая ошибка: ${syntaxError.message}`],
            warnings: [],
            syntaxErrorLine: syntaxError.line
        };
    }

    const { errors, warnings } = analyzeCode(code);
    const fixedCode = fixImports(code);

    return {
        fixedCode,
        errors,
        warnings
    };
}

module.exports = { processCode, checkSyntax, analyzeCode, fixImports };
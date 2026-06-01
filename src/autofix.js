

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

// Убирает комментарии и содержимое строк/шаблонов, чтобы детекторы не
// срабатывали на текст внутри кавычек и комментариев (ложные срабатывания/дубли).
function stripForDetect(code) {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ')
        .replace(/`(?:\\.|[^`\\])*`/g, '""')
        .replace(/'(?:\\.|[^'\\])*'/g, "''")
        .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

// Убирает ТОЛЬКО комментарии, сохраняя содержимое строк. Нужен для
// детекта `require('docx')` и т.п.: там содержимое кавычек важно, поэтому
// stripForDetect (он вырезает строки) тут давал бы ложный результат и дубли.
// Однопроходный разбор корректно обрабатывает `//` и `/* */` внутри строк.
function stripComments(code) {
    let out = '';
    let i = 0;
    const n = code.length;
    while (i < n) {
        const c = code[i];
        const d = code[i + 1];
        if (c === '/' && d === '/') {
            i += 2;
            while (i < n && code[i] !== '\n') i++;
            continue;
        }
        if (c === '/' && d === '*') {
            i += 2;
            while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++;
            i += 2;
            out += ' ';
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            const quote = c;
            out += c;
            i++;
            while (i < n) {
                if (code[i] === '\\') {
                    out += code[i] + (code[i + 1] || '');
                    i += 2;
                    continue;
                }
                out += code[i];
                if (code[i] === quote) {
                    i++;
                    break;
                }
                i++;
            }
            continue;
        }
        out += c;
        i++;
    }
    return out;
}

function analyzeCode(code) {
    const errors = [];
    const warnings = [];
    const scan = stripForDetect(code);
    // Для детекта require(...) строки нужно сохранить, иначе require('docx')
    // превращается в require('') и проверка всегда ложна.
    const importScan = stripComments(code);

    if (!scan.includes('new Document') && !scan.includes('docx.Document')) {
        errors.push("Код не создает документ (нет `new Document`).");
    }

    if (!scan.includes('Packer.toBuffer') && !scan.includes('Packer.toBlob')) {
        errors.push("Код не упаковывает документ (нет `Packer.toBuffer`).");
    }

    if (!scan.includes('fs.writeFileSync') && !scan.includes('fs.writeFile')) {
        errors.push("Код не сохраняет файл на диск (нет `fs.writeFileSync`).");
    }

    if (!importScan.includes("require('docx')") && (scan.includes('new Document') || scan.includes('docx.Document'))) {
        warnings.push("Нет импорта `docx`. Он будет добавлен автоматически, но лучше добавить `const { ... } = require('docx');`.");
    }

    if (scan.includes('new document')) {
        errors.push("Возможно, опечатка: `new document`. Классы docx пишутся с большой буквы: `new Document`.");
    }

    if (/new Paragraph\s*\(\s*['"`]/.test(scan)) {
        warnings.push("`new Paragraph('текст')` — это старый синтаксис. Используйте `new Paragraph({ children: [ new TextRun('текст') ] })`.");
    }

    const lines = code.split('\n');
    lines.forEach((line, index) => {
        const trimmed = line.trim();

        if (/^[a-zA-Zа-яА-ЯёЁ_$][a-zA-Z0-9а-яА-ЯёЁ_$]*;?$/.test(trimmed)) {
            const word = trimmed.replace(';', '');
            const keywords = ['break', 'continue', 'debugger', 'return'];
            if (!keywords.includes(word)) {
                warnings.push(`Строка ${index + 1}: "${word}" выглядит как опечатка или лишний код.`);
            }
        }

        const noComments = line.split('//')[0];
        const noStrings = noComments.replace(/(["'`])(?:\\.|[^\\])*?\1/g, '');

        if (/[а-яА-ЯёЁ]/.test(noStrings)) {
            warnings.push(`Строка ${index + 1}: Обнаружена кириллица вне кавычек. Проверьте имена переменных.`);
        }
    });

    if (/new\s+PageNumber\s*\(\s*\)/.test(scan)) {
        errors.push("КРИТИЧЕСКАЯ ОШИБКА: `new PageNumber()` не работает. Используйте `new TextRun({ children: [PageNumber.CURRENT] })`.");
    }

    if (!code.trim()) {
        warnings.push("Код пустой.");
    }

    return { errors, warnings };
}

function fixPageNumber(code) {
    return code.replace(/new\s+PageNumber\s*\(\s*\)/g, 'new TextRun({ children: [PageNumber.CURRENT] })');
}

function fixImports(userCode) {
    let fixedCode = userCode;
    // Детект ведём по коду без комментариев, НО со строками: содержимое
    // require('docx') важно. stripForDetect вырезал бы строки и приводил к
    // дублю `const {...} = require('docx')` (SyntaxError в сгенерированном коде).
    const detect = stripComments(userCode);

    if (!detect.includes("require('docx')")) {
        const imports = `const { ${ALL_MODULES.join(', ')} } = require('docx');\n`;
        fixedCode = imports + fixedCode;
    }

    if ((detect.includes('fs.') || detect.includes('writeFileSync')) && !detect.includes("require('fs')")) {
        fixedCode = `const fs = require('fs');\n` + fixedCode;
    }

    if ((detect.includes('path.') || detect.includes('join(')) && !detect.includes("require('path')")) {
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

    let fixedCode = fixImports(code);
    fixedCode = fixPageNumber(fixedCode);

    return {
        fixedCode,
        errors,
        warnings
    };
}

module.exports = { processCode, checkSyntax, analyzeCode, fixImports };
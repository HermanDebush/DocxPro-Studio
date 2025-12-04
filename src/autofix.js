

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

    if (!code.includes('new Document') && !code.includes('docx.Document')) {
        errors.push("Код не создает документ (нет `new Document`).");
    }

    if (!code.includes('Packer.toBuffer') && !code.includes('Packer.toBlob')) {
        errors.push("Код не упаковывает документ (нет `Packer.toBuffer`).");
    }

    if (!code.includes('fs.writeFileSync') && !code.includes('fs.writeFile')) {
        errors.push("Код не сохраняет файл на диск (нет `fs.writeFileSync`).");
    }

    if (!code.includes("require('docx')") && (code.includes('new Document') || code.includes('docx.Document'))) {
        warnings.push("Нет импорта `docx`. Он будет добавлен автоматически, но лучше добавить `const { ... } = require('docx');`.");
    }

    if (code.includes('new document')) {
        errors.push("Возможно, опечатка: `new document`. Классы docx пишутся с большой буквы: `new Document`.");
    }

    if (/new Paragraph\s*\(\s*['"`]/.test(code)) {
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
        const noStrings = noComments.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '');

        if (/[а-яА-ЯёЁ]/.test(noStrings)) {
            warnings.push(`Строка ${index + 1}: Обнаружена кириллица вне кавычек. Проверьте имена переменных.`);
        }
    });

    if (/new\s+PageNumber\s*\(\s*\)/.test(code)) {
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

    let fixedCode = fixImports(code);
    fixedCode = fixPageNumber(fixedCode);

    return {
        fixedCode,
        errors,
        warnings
    };
}

module.exports = { processCode, checkSyntax, analyzeCode, fixImports };
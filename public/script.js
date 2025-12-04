/*
 * ==========================================================================
 * SNN PROJECT | Союз Независимых Наработок
 * ==========================================================================
 * Website:   https://snnproject.ru
 * Developer: Herman
 * License:   SNN Private License
 * --------------------------------------------------------------------------
 * Description: Frontend Logic
 * ==========================================================================
 */

console.log("Pro Script v2.0 Loaded");

const btnRun = document.getElementById('btnRun');
const btnPaste = document.getElementById('btnPaste');
const fileInput = document.getElementById('fileInput');
const btnCheck = document.getElementById('btnCheck');
const diagBox = document.getElementById('diagBox');
const loader = document.getElementById('loader');
const saveStatus = document.getElementById('saveStatus');

const cm = CodeMirror.fromTextArea(document.getElementById("codeEditor"), {
    mode: "javascript",
    theme: "dracula",
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 4,
    matchBrackets: true,
    autoCloseBrackets: true
});

const savedCode = localStorage.getItem('docxProCode');
if (savedCode) {
    cm.setValue(savedCode);
    console.log("Код восстановлен из памяти.");
} else {
    cm.setValue(`// Вставь свой код сюда\n// Программа сама подключит Header, Footer и всё остальное.\n\ncreatePara("Привет, мир!");`);
}

let validationTimeout;
let errorMarkers = [];

function clearMarkers() {
    errorMarkers.forEach(marker => marker.clear());
    errorMarkers = [];

    const oldWarnings = document.querySelectorAll('.validation-warning, .validation-error');
    oldWarnings.forEach(el => el.remove());
}

async function validateCode() {
    clearMarkers();
    const code = cm.getValue();
    if (!code.trim()) return;

    try {
        const response = await fetch('/api/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const result = await response.json();

        if (result.syntaxErrorLine) {
            const lineNum = parseInt(result.syntaxErrorLine.split(':')[1]) - 1;
            if (!isNaN(lineNum)) {
                const marker = cm.markText(
                    { line: lineNum, ch: 0 },
                    { line: lineNum, ch: 100 },
                    { className: "error-line", title: result.errors[0] }
                );
                errorMarkers.push(marker);
            }
        }

        const sidebar = document.querySelector('.sidebar');

        // ТЕПЕРЬ ПОКАЗЫВАЕМ ВСЕ ОШИБКИ, ВКЛЮЧАЯ СИНТАКСИЧЕСКИЕ
        result.errors.forEach(err => {
            const div = document.createElement('div');
            div.className = 'validation-error';
            div.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${err}`;
            sidebar.insertBefore(div, saveStatus);
        });

        result.warnings.forEach(warn => {
            const div = document.createElement('div');
            div.className = 'validation-warning';
            div.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${warn}`;
            sidebar.insertBefore(div, saveStatus);
        });

    } catch (e) {
        console.error("Ошибка валидации:", e);
    }
}

cm.on('change', () => {
    localStorage.setItem('docxProCode', cm.getValue());
    saveStatus.style.color = "#4caf50";
    saveStatus.innerHTML = '<i class="fa-solid fa-check"></i> Сохранено';
    setTimeout(() => {
        saveStatus.style.color = "#8b949e";
        saveStatus.innerHTML = '<i class="fa-regular fa-floppy-disk"></i> Автосохранение';
    }, 1000);

    clearTimeout(validationTimeout);
    validationTimeout = setTimeout(validateCode, 1000);
});

if (btnPaste) {
    btnPaste.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            cm.setValue(text);
        } catch (err) {
            alert('Нет доступа к буферу обмена');
        }
    });
}

const dropZone = document.getElementById('dropZone');

function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        cm.setValue(e.target.result);
        fileInput.value = '';
    };
    reader.readAsText(file);
}

if (fileInput) {
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
}

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
});

dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFile(files[0]);
});

if (btnCheck) {
    btnCheck.addEventListener('click', async () => {
        diagBox.style.display = 'block';
        diagBox.innerHTML = "⏳ Проверка Word...";
        diagBox.style.borderLeft = "3px solid orange";

        try {
            const response = await fetch('/api/check');
            const data = await response.json();

            if (data.wordStatus === 'OK') {
                diagBox.style.borderLeft = "3px solid #4caf50";
                diagBox.innerHTML = `
                    <strong style="color:#4caf50">✅ Word найден!</strong><br>
                    <small>${data.details}</small>
                `;
            } else {
                diagBox.style.borderLeft = "3px solid #ff4444";
                diagBox.innerHTML = `
                    <strong style="color:#ff4444">❌ Ошибка Word:</strong><br>
                    <small>${data.error || "Неизвестная ошибка"}</small>
                `;
            }
        } catch (e) {
            diagBox.innerHTML = "Ошибка связи с сервером.";
        }
    });
}

if (btnRun) {
    btnRun.addEventListener('click', async () => {
        const code = cm.getValue();
        const format = document.getElementById('formatSelect').value;
        const autofix = document.getElementById('autofixCheckbox').checked;

        if (!code.trim()) {
            alert("Сначала вставь код в поле!");
            return;
        }

        loader.style.display = 'flex';

        try {
            const response = await fetch('/api/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, format, autofix })
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = format === 'pdf' ? 'Result.pdf' : 'Result.docx';
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
            } else {
                const errData = await response.json();
                alert(`ОШИБКА ГЕНЕРАЦИИ:\n${errData.error}`);
            }
        } catch (e) {
            alert("Ошибка сети! Сервер не отвечает.");
            console.error(e);
        } finally {
            loader.style.display = 'none';
        }
    });
}
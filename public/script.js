

console.log("Pro Script v2.0 Loaded");

// Проверка официальной установки: если копия неофициальная (нет лаунчера /
// запуск из исходника) — показываем мягкое напоминание про Центр обновлений СНН.
// Перепроверяем периодически: статус официальности читается из installed.json
// на каждый запрос, поэтому если лаунчер поставили/запустили уже ПОСЛЕ старта
// DocxPro — плашка исчезнет сама, без перезапуска приложения.
(function initLocalModeBanner() {
    const banner = document.getElementById('localModeBanner');
    const closeBtn = document.getElementById('localModeClose');
    if (!banner) return;

    let dismissed = false; // пользователь закрыл плашку вручную — больше не навязываем
    const startedAt = Date.now();
    const GRACE_MS = 6000;  // первые 6 c не паникуем — даём времени обнаружить лаунчер
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            dismissed = true;
            banner.style.display = 'none';
        });
    }

    async function refresh() {
        try {
            const r = await fetch('/api/meta', { cache: 'no-store' });
            const meta = await r.json();
            if (meta && meta.official === false) {
                // Показываем только если грейс-период истёк (лаунчер мог ещё
                // стартовать / installed.json дописаться) и юзер не закрывал.
                if (!dismissed && (Date.now() - startedAt) >= GRACE_MS) {
                    banner.style.display = 'flex';
                }
            } else {
                // official === true → лаунчер на месте: убираем уведомление.
                banner.style.display = 'none';
            }
        } catch (e) {
            /* сервер недоступен (эндпоинта нет / закрывается) — не трогаем */
        }
    }

    refresh();
    setInterval(refresh, 2000);  // чаще, чтобы сразу после грейса среагировать
})();

// Heartbeat: пингуем сервер раз в 2 c. Если он перестал отвечать (приложение
// закрыли из Центра обновлений СНН, краш или ручная остановка) — после двух
// подряд неудачных пингов показываем экран «Приложение закрыто». Так юзер
// понимает, что окно браузера можно закрывать.
(function startHeartbeat() {
    const overlay = document.getElementById('shutdownOverlay');
    if (!overlay) return;
    let misses = 0;
    let inflight = false;

    async function ping() {
        if (inflight) return; // не наслаиваем запросы
        inflight = true;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500);
        try {
            const r = await fetch('/api/ping', { cache: 'no-store', signal: ctrl.signal });
            if (!r.ok) throw new Error('bad status');
            // сервер жив — сбрасываем счётчик и убираем экран, если он висел
            // (значит был лишь кратковременный простой, а не закрытие).
            misses = 0;
            if (overlay.style.display !== 'none') overlay.style.display = 'none';
        } catch (e) {
            // показываем экран только после 2 подряд неудач — чтобы случайная
            // заминка не давала ложного «Приложение закрыто».
            if (++misses >= 2) overlay.style.display = 'flex';
        } finally {
            clearTimeout(t);
            inflight = false;
        }
    }

    setInterval(ping, 2000);
})();

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

        const pageNumberError = result.errors.find(e => e.includes('new PageNumber'));
        if (pageNumberError) {
            const cursor = cm.getSearchCursor(/new\s+PageNumber\s*\(\s*\)/);
            while (cursor.findNext()) {
                const marker = cm.markText(
                    cursor.from(),
                    cursor.to(),
                    { className: "error-line", title: "Ошибка: PageNumber не конструктор" }
                );
                errorMarkers.push(marker);
            }
        }

        const sidebar = document.querySelector('.sidebar');

        result.errors.forEach(err => {
            const div = document.createElement('div');
            div.className = 'validation-error';
            const icon = document.createElement('i');
            icon.className = 'fa-solid fa-circle-exclamation';
            div.appendChild(icon);
            div.appendChild(document.createTextNode(' ' + err));
            sidebar.insertBefore(div, saveStatus);
        });

        result.warnings.forEach(warn => {
            const div = document.createElement('div');
            div.className = 'validation-warning';
            const icon = document.createElement('i');
            icon.className = 'fa-solid fa-triangle-exclamation';
            div.appendChild(icon);
            div.appendChild(document.createTextNode(' ' + warn));
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

            const renderDiag = (color, title, detail) => {
                diagBox.style.borderLeft = "3px solid " + color;
                diagBox.textContent = '';
                const strong = document.createElement('strong');
                strong.style.color = color;
                strong.textContent = title;
                const small = document.createElement('small');
                small.textContent = detail || '';
                diagBox.appendChild(strong);
                diagBox.appendChild(document.createElement('br'));
                diagBox.appendChild(small);
            };

            if (data.wordStatus === 'OK') {
                renderDiag('#4caf50', '✅ Word найден!', data.details);
            } else {
                renderDiag('#ff4444', '❌ Ошибка Word:', data.error || 'Неизвестная ошибка');
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
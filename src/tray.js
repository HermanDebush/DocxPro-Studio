"use strict";

/**
 * Системный трей DocxPro Studio.
 *
 * Иконка в системном лотке с меню «Открыть / Выход», чтобы приложение не «висело»
 * безымянным процессом, а имело понятное присутствие и способ закрыться.
 *
 * Принципы:
 *  - Полная независимость от лаунчера: трей и сервер работают сами по себе,
 *    что бы ни происходило с Центром обновлений СНН.
 *  - Graceful-degradation: при ЛЮБОЙ ошибке инициализации (нет systray2, нет
 *    иконки, не извлёкся нативный помощник в pkg) трей просто отключается —
 *    сервер и браузер продолжают работать как раньше. Трей не должен ронять
 *    приложение.
 *
 * В pkg-сборке нативный помощник systray2 (tray_windows_release.exe) лежит в
 * снапшоте; опция copyDir извлекает его во временную папку и запускает оттуда.
 * Помощник нужно включить в pkg.assets (см. package.json).
 */

const fs = require("fs");
const path = require("path");

function initTray({ url, onQuit }) {
    let SysTray;
    try {
        const mod = require("systray2");
        SysTray = mod.default || mod;
    } catch (e) {
        console.error("[tray] systray2 недоступен — трей отключён:", e.message);
        return null;
    }

    // Иконку ищем рядом с exe (как и public/). В pkg __dirname виртуальный,
    // поэтому опираемся на путь к самому exe.
    const baseDir = process.pkg
        ? path.dirname(process.execPath)
        : path.join(__dirname, "..");

    let iconB64;
    try {
        iconB64 = fs.readFileSync(path.join(baseDir, "docxpro.ico")).toString("base64");
    } catch (e) {
        console.error("[tray] иконка docxpro.ico не найдена — трей отключён:", e.message);
        return null;
    }

    let open;
    try { open = require("open"); } catch (e) { /* откроем через fallback */ }

    function openBrowser() {
        if (!url) return;
        if (open) {
            open(url).catch(() => fallbackOpen(url));
        } else {
            fallbackOpen(url);
        }
    }
    function fallbackOpen(u) {
        try { require("child_process").exec(`start "" "${u}"`); } catch (e) {}
    }

    const SEQ_OPEN = 0;
    const SEQ_QUIT = 1;

    let systray;
    try {
        systray = new SysTray({
            menu: {
                icon: iconB64,
                isTemplateIcon: false,
                title: "DocxPro Studio",
                tooltip: "DocxPro Studio — СНН PROJECT",
                items: [
                    { title: "Открыть", tooltip: "Открыть DocxPro в браузере", enabled: true },
                    { title: "Выход", tooltip: "Закрыть DocxPro", enabled: true },
                ],
            },
            debug: false,
            copyDir: true, // извлечь нативный помощник во временную папку (нужно для pkg)
        });
    } catch (e) {
        console.error("[tray] не удалось создать трей:", e.message);
        return null;
    }

    systray.onClick((action) => {
        if (action.seq_id === SEQ_OPEN) {
            openBrowser();
        } else if (action.seq_id === SEQ_QUIT) {
            try { systray.kill(false); } catch (e) {}
            if (typeof onQuit === "function") {
                try { onQuit(); return; } catch (e) {}
            }
            process.exit(0);
        }
    });

    if (typeof systray.ready === "function") {
        systray.ready().catch((e) => {
            console.error("[tray] ошибка запуска трея:", e && e.message);
        });
    }

    console.log("[tray] системный трей DocxPro активен");
    return systray;
}

module.exports = { initTray };

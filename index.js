/*
 * ==========================================================================
 * СНН PROJECT | Союз Независимых Наработок
 * ==========================================================================
 * Website:   https://snnproject.ru
 * Developer: Herman
 * License:   СНН Private License
 * --------------------------------------------------------------------------
 * Description: Entry Point (DEBUG MODE + FILE LOGGING)
 * ==========================================================================
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// --- CRASH LOGGER ---
function writeCrashLog(err, type) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logContent = `
================================================================================
CRASH REPORT (${type})
Timestamp: ${new Date().toISOString()}
User: ${os.userInfo().username}
Platform: ${os.platform()} ${os.release()}
================================================================================

ERROR MESSAGE:
${err.message}

STACK TRACE:
${err.stack}
================================================================================
`;

  const fileName = `crash_log_${timestamp}.txt`;

  // 1. Try writing to program folder (process.cwd())
  let logPath = path.join(process.cwd(), fileName);
  try {
    fs.writeFileSync(logPath, logContent);
    console.log(`\n[SAVED] Полный лог ошибки сохранен в файл:\n${logPath}`);
  } catch (writeErr) {
    console.error(`\n[WARNING] Не удалось записать лог в папку программы (${writeErr.message})`);
    // 2. Fallback to Documents
    try {
      const docsDir = path.join(os.homedir(), 'Documents');
      logPath = path.join(docsDir, fileName);
      fs.writeFileSync(logPath, logContent);
      console.log(`\n[SAVED] Лог сохранен в Документы:\n${logPath}`);
    } catch (e2) {
      console.error(`\n[ERROR] Не удалось сохранить лог никуда.`);
    }
  }
}

// 1. Global Error Handlers (IMMEDIATE)
process.on('uncaughtException', (err) => {
  console.error('\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.error('!!! КРИТИЧЕСКАЯ ОШИБКА (uncaughtException) !!!');
  console.error('!!! Сообщение:', err.message);
  console.error('!!! Стек:', err.stack);
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');

  writeCrashLog(err, 'uncaughtException');

  console.log('Нажмите любую клавишу для выхода...');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', process.exit.bind(process, 1));
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.error('!!! НЕОБРАБОТАННАЯ ОШИБКА (unhandledRejection) !!!');
  console.error('!!! Причина:', reason);
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');

  const err = reason instanceof Error ? reason : new Error(String(reason));
  writeCrashLog(err, 'unhandledRejection');
});

console.log('[DEBUG] 1. Запуск index.js...');
console.log('[DEBUG] 2. Модуль os загружен.');

const username = os.userInfo().username;
console.log(`[DEBUG] 3. Пользователь определен: ${username}`);

let open;
try {
  open = require('open');
  console.log('[DEBUG] 4. Модуль open загружен.');
} catch (e) {
  console.error('[DEBUG] !!! ОШИБКА загрузки open:', e.message);
}

let app;
try {
  console.log('[DEBUG] 5. Попытка загрузки ./src/server ...');
  app = require('./src/server');
  console.log('[DEBUG] 6. Модуль ./src/server успешно загружен.');
} catch (e) {
  console.error('\n!!! ОШИБКА ПРИ ЗАГРУЗКЕ SERVER.JS !!!');
  console.error('Возможные причины: ошибка в коде server.js или отсутствующий файл.');
  console.error('Детали ошибки:', e);
  throw e; // Пробрасываем, чтобы сработал uncaughtException
}

console.log(`
  ____  _   _  _   _ 
 / ___|| \\ | || \\ | |    СНН PROJECT
 \\___ \\|  \\| ||  \\| |    ---------------
  ___) | |\\  || |\\  |    snnproject.ru
 |____/|_| \\_||_| \\_|    
 
 [Союз Независимых Наработок]
 >> Разработчик: Herman
 >> Пользователь: ${username}
 >> Статус:      ЗАПУСК...
`);

console.log("========================================");
console.log(" СНН PROJECT | Союз Независимых Наработок");
console.log(" https://snnproject.ru");
console.log("========================================");
console.log(` Welcome, ${username}! System is ready.`);

// Ищем свободный порт
try {
  const server = app.listen(0, () => {
    const port = server.address().port;
    const url = `http://localhost:${port}`;
    console.log(`[DEBUG] 7. Сервер запущен на порту ${port}`);
    console.log(`DocxPro запущен на порту ${port}`);
    console.log(`[DEBUG] 8. Попытка открыть браузер: ${url}`);

    // Delay to ensure server is ready
    setTimeout(() => {
      if (open) {
        open(url).catch(err => {
          console.error(`[DEBUG] Ошибка open(): ${err.message}`);
          fallbackOpen(url);
        });
      } else {
        fallbackOpen(url);
      }
    }, 1500);
  });
} catch (e) {
  console.error('[DEBUG] !!! ОШИБКА запуска сервера:', e.message);
}

function fallbackOpen(url) {
  console.log('[DEBUG] Пробую открыть через команду start...');
  require('child_process').exec(`start ${url}`, (err) => {
    if (err) console.error(`[DEBUG] Не удалось открыть браузер даже через start: ${err.message}`);
  });
}

// Keep process alive
console.log('[DEBUG] 9. Ожидание событий...');
process.stdin.resume();
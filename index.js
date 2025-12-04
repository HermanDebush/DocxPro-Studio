

const fs = require('fs');
const path = require('path');
const os = require('os');

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

  let logPath = path.join(process.cwd(), fileName);
  try {
    fs.writeFileSync(logPath, logContent);
    console.log(`\n[SAVED] Полный лог ошибки сохранен в файл:\n${logPath}`);
  } catch (writeErr) {
    console.error(`\n[WARNING] Не удалось записать лог в папку программы (${writeErr.message})`);
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

const username = os.userInfo().username;

let open;
try {
  open = require('open');
} catch (e) {
  console.error('!!! ОШИБКА загрузки open:', e.message);
}

let app;
try {
  app = require('./src/server');
} catch (e) {
  console.error('\n!!! ОШИБКА ПРИ ЗАГРУЗКЕ SERVER.JS !!!');
  console.error('Возможные причины: ошибка в коде server.js или отсутствующий файл.');
  console.error('Детали ошибки:', e);
  throw e;
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

try {
  const server = app.listen(0, () => {
    const port = server.address().port;
    const url = `http://localhost:${port}`;
    console.log(`DocxPro запущен на порту ${port}`);

    setTimeout(() => {
      if (open) {
        open(url).catch(err => {
          console.error(`Ошибка open(): ${err.message}`);
          fallbackOpen(url);
        });
      } else {
        fallbackOpen(url);
      }
    }, 1500);
  });
} catch (e) {
  console.error('!!! ОШИБКА запуска сервера:', e.message);
}

function fallbackOpen(url) {
  require('child_process').exec(`start ${url}`, (err) => {
    if (err) console.error(`Не удалось открыть браузер даже через start: ${err.message}`);
  });
}

process.stdin.resume();
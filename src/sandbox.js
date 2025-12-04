

const vm = require('vm');
const docx = require('docx');
const fs = require('fs');
const path = require('path');

function runUserCode(code, outputDir) {
    return new Promise((resolve, reject) => {

        const docxGlobals = {};
        Object.keys(docx).forEach(key => {
            docxGlobals[key] = docx[key];
        });

        const sandbox = {
            ...docxGlobals,

            require: (name) => {
                if (name === 'docx') return docx;
                if (name === 'fs') {
                    return {
                        ...fs,
                        writeFileSync: (filePath, data, options) => {

                            const fileName = path.basename(filePath);
                            const finalPath = path.join(outputDir, fileName);
                            console.log(`[Sandbox] Перенаправление записи: ${filePath} -> ${finalPath}`);
                            return fs.writeFileSync(finalPath, data, options);
                        },
                        writeFile: (filePath, data, options, callback) => {
                            if (typeof options === 'function') {
                                callback = options;
                                options = {};
                            }
                            const fileName = path.basename(filePath);
                            const finalPath = path.join(outputDir, fileName);
                            console.log(`[Sandbox] Перенаправление записи: ${filePath} -> ${finalPath}`);
                            return fs.writeFile(finalPath, data, options, callback);
                        }
                    };
                }
                if (name === 'path') return path;
                return {};
            },
            console: console,
            setTimeout: setTimeout,
            Buffer: Buffer,
            process: process,
            Math: Math,
            JSON: JSON
        };

        try {
            vm.createContext(sandbox);
            const result = vm.runInContext(code, sandbox);

            const checkFile = () => {
                try {
                    const files = fs.readdirSync(outputDir)
                        .filter(f => f.endsWith('.docx') && !f.startsWith('~$'))
                        .map(name => ({ name, time: fs.statSync(path.join(outputDir, name)).mtime.getTime() }))
                        .sort((a, b) => b.time - a.time);

                    if (files.length > 0) {
                        resolve(path.join(outputDir, files[0].name));
                    } else {
                        reject(new Error("Код выполнился, но файл .docx не появился. Проверь строку fs.writeFileSync."));
                    }
                } catch (e) {
                    reject(e);
                }
            };

            if (result && typeof result.then === 'function') {
                result.then(() => {
                    console.log("[Sandbox] Promise resolved, checking for file...");
                    setTimeout(checkFile, 100); // Small delay to ensure FS flush
                }).catch(err => {
                    console.error("[Sandbox] Promise rejected:", err);
                    reject(err);
                });
            } else {

                console.log("[Sandbox] Sync execution or no promise returned, waiting...");
                setTimeout(checkFile, 2000); // Increased from 800ms to 2000ms
            }

        } catch (err) {
            reject(err);
        }
    });
}

module.exports = { runUserCode };
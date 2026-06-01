const { spawn } = require('child_process');

function checkSystem() {
    return new Promise((resolve) => {
        const results = {
            os: process.platform,
            wordStatus: 'UNKNOWN',
            error: null
        };

        const psScript = `
            try {
                $ErrorActionPreference = "Stop"
                Write-Host "Checking Word..."
                
                $word = New-Object -ComObject Word.Application
                
                $version = $word.Version
                Write-Host "WORD_FOUND: Version $version"
                
                $word.Quit()
                
                [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
            } catch {
                Write-Host "WORD_ERROR: $($_.Exception.Message)"
                exit 1
            }
        `;

        const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript]);

        let output = '';

        child.stdout.on('data', (data) => { output += data.toString(); });
        child.stderr.on('data', (data) => { output += data.toString(); });

        child.on('error', (e) => {
            results.wordStatus = 'FAIL';
            results.error = "Не удалось запустить PowerShell: " + e.message;
            resolve(results);
        });

        child.on('close', (code) => {
            if (output.includes("WORD_FOUND")) {
                results.wordStatus = 'OK';
                results.details = output.trim();
            } else {
                results.wordStatus = 'FAIL';
                results.error = output.replace(/(\r\n|\n|\r)/gm, " ").trim();
            }
            resolve(results);
        });
    });
}

module.exports = { checkSystem };
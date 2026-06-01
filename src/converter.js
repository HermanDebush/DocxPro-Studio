const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

function convertToPdf(docxPath, outputDir) {
    return new Promise((resolve, reject) => {
        const fullDocxPath = path.resolve(docxPath);
        const pdfFileName = path.basename(docxPath, '.docx') + '.pdf';
        const fullPdfPath = path.join(path.resolve(outputDir), pdfFileName);

        const b64Input = Buffer.from(fullDocxPath).toString('base64');
        const b64Output = Buffer.from(fullPdfPath).toString('base64');

        const psScript = `
            $b64Input = "${b64Input}"
            $b64Output = "${b64Output}"

            $inputPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b64Input))
            $outputPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b64Output))

            try {
                $word = New-Object -ComObject Word.Application
                $word.Visible = $false
                $word.DisplayAlerts = "wdAlertsNone"

                if (Test-Path $outputPath) { Remove-Item $outputPath -Force }

                $doc = $word.Documents.Open($inputPath, $false, $true)

                $doc.ExportAsFixedFormat($outputPath, 17, $false, 0, 0, 0, 0, 0, $true, $true, 0, $true, $true, $false)

                $doc.Close($false)
                $word.Quit()
                
                [System.Runtime.Interopservices.Marshal]::ReleaseComObject($doc) | Out-Null
                [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
                [System.GC]::Collect()

                Write-Host "SUCCESS"
            } catch {
                Write-Error $_.Exception.Message
                if ($word) { $word.Quit() }
                exit 1
            }
        `;

        const psPath = path.join(outputDir, 'temp_export.ps1');
        fs.writeFileSync(psPath, '\ufeff' + psScript, { encoding: 'utf8' });

        console.log("Экспорт в PDF (Safe Mode)...");

        const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath]);

        let outputData = "";
        child.stdout.on('data', (data) => { outputData += data.toString(); });

        child.stderr.on('data', (data) => {
            console.error("PS Error:", data.toString());
        });

        child.on('error', (e) => {
            try { fs.unlinkSync(psPath); } catch (err) {}
            reject(new Error("Не удалось запустить PowerShell: " + e.message));
        });

        child.on('close', (code) => {
            try { fs.unlinkSync(psPath); } catch (e) { }

            if (code === 0 && outputData.includes("SUCCESS")) {
                console.log("PDF готов:", fullPdfPath);
                resolve(fullPdfPath);
            } else {
                reject(new Error("Ошибка экспорта PDF. См. консоль."));
            }
        });
    });
}

module.exports = { convertToPdf };
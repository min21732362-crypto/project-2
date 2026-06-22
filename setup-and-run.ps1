$ErrorActionPreference = "Stop"

Write-Host "============================================="
Write-Host "Daejin Balancer Automatic Server Runner"
Write-Host "============================================="

$nodeExe = ""
$npmCmd = ""

try {
    $globalNode = Get-Command node -ErrorAction SilentlyContinue
    if ($globalNode) {
        $nodeExe = "node"
        $npmCmd = "npm"
        Write-Host "Global Node.js detected."
    }
} catch {}

if ($nodeExe -eq "") {
    Write-Host "Node.js not detected. Setting up portable Node.js..."
    
    $portableDir = Join-Path $PSScriptRoot "node-portable"
    $zipPath = Join-Path $PSScriptRoot "node.zip"
    
    if (-not (Test-Path $portableDir)) {
        New-Item -ItemType Directory -Force -Path $portableDir | Out-Null
        
        $url = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-win-x64.zip"
        Write-Host "Downloading..."
        
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile($url, $zipPath)
        
        Write-Host "Extracting zip..."
        Expand-Archive -Path $zipPath -DestinationPath $portableDir -Force
        
        Remove-Item -Path $zipPath -Force
    }
    
    $extractedFolder = Get-ChildItem -Path $portableDir | Select-Object -First 1
    $binDir = $extractedFolder.FullName
    
    $nodeExe = Join-Path $binDir "node.exe"
    $npmCmd = Join-Path $binDir "npm.cmd"
}

Write-Host "Installing dependencies..."
$installProcess = Start-Process -FilePath $npmCmd -ArgumentList "install" -WorkingDirectory $PSScriptRoot -PassThru -NoNewWindow -Wait

if ($installProcess.ExitCode -ne 0) {
    Write-Host "Failed to install dependencies."
    Exit
}

Write-Host "Launching browser and starting server..."
Start-Sleep -Seconds 1
Start-Process "http://localhost:3000"

$serverPath = Join-Path $PSScriptRoot "server/server.js"
& $nodeExe $serverPath

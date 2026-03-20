# Download AZ ROC CSV using PowerShell's HttpClient (different TLS fingerprint than Node.js)
param([string]$OutFile = "C:\Users\glcar\constructflix\.firecrawl\az_roc_dual.csv")

$url = "https://roc.az.gov/sites/default/files/ROC_Posting-List_Dual_2026-03-11.csv"

$headers = @{
    "User-Agent"      = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    "Accept"          = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    "Accept-Language" = "en-US,en;q=0.9"
    "Accept-Encoding" = "gzip, deflate, br"
    "Referer"         = "https://roc.az.gov/posting-list"
}

Write-Output "Downloading AZ ROC Dual license CSV..."
Write-Output "URL: $url"

try {
    Invoke-WebRequest -Uri $url -Headers $headers -OutFile $OutFile -UseBasicParsing
    $size = (Get-Item $OutFile).Length
    Write-Output "SUCCESS: Downloaded $([Math]::Round($size/1MB, 1)) MB to $OutFile"
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"

    # Try alternative: first visit the main page to get cookies, then download
    Write-Output "Trying with session cookies..."
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    try {
        Invoke-WebRequest -Uri "https://roc.az.gov/posting-list" -Headers $headers -SessionVariable session -UseBasicParsing | Out-Null
        Start-Sleep 1
        Invoke-WebRequest -Uri $url -Headers $headers -WebSession $session -OutFile $OutFile -UseBasicParsing
        $size = (Get-Item $OutFile).Length
        Write-Output "SUCCESS with session: $([Math]::Round($size/1MB, 1)) MB"
    } catch {
        Write-Output "FAILED: $($_.Exception.Message)"
    }
}

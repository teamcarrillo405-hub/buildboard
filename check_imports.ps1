foreach ($s in @('AZ', 'IL', 'MN')) {
    $f = "C:\Users\glcar\constructflix\state_import_$s.txt"
    $size = (Get-Item $f -ErrorAction SilentlyContinue).Length
    Write-Host "=== $s (size=$size) ==="
    if ($size -gt 0) {
        $text = [System.IO.File]::ReadAllText($f)
        Write-Host $text.Substring(0, [Math]::Min($text.Length, 800))
    } else {
        Write-Host "(empty)"
    }
    Write-Host ""
}

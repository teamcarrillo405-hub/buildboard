$files = Get-ChildItem "C:\Users\glcar\constructflix\logs\" -Filter "enrichWorker_*_of_20.json"
foreach ($f in $files) {
    $j = Get-Content $f.FullName | ConvertFrom-Json
    Write-Host "$($f.Name): processed=$($j.processed) found=$($j.found) emails=$($j.foundEmail) last=$($j.lastBusiness)"
}
Write-Host "Total files: $($files.Count)"

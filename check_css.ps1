foreach ($f in @('assets/css/styles.css', 'assets/css/admin.css')) {
    $content = Get-Content $f -Raw
    $b1 = ($content -split '\{').Count - 1
    $b2 = ($content -split '\}').Count - 1
    Write-Output "$f - braces: $b1/$b2"
}

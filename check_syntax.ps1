foreach ($f in @('assets/js/app.js', 'assets/js/admin.js')) {
    $content = Get-Content $f -Raw
    $b1 = ($content -split '\{').Count - 1
    $b2 = ($content -split '\}').Count - 1
    $p1 = ($content -split '\(').Count - 1
    $p2 = ($content -split '\)').Count - 1
    $s1 = ($content -split '\[').Count - 1
    $s2 = ($content -split '\]').Count - 1
    Write-Output "$f - braces: $b1/$b2, parens: $p1/$p2, brackets: $s1/$s2"
}

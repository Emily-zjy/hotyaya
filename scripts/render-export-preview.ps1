$ErrorActionPreference = 'Stop'
$previewRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.superpowers/pet-preview/exports'))
$alreadyRunning = @(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count -gt 0
$powerPoint = New-Object -ComObject PowerPoint.Application
try {
  foreach ($design in @('editorial', 'studio', 'technical')) {
    $deckPath = Join-Path $previewRoot ($design + '.pptx')
    $imageDir = Join-Path $previewRoot ($design + '-rendered')
    [IO.Directory]::CreateDirectory($imageDir) | Out-Null
    $presentation = $powerPoint.Presentations.Open($deckPath, -1, 0, 0)
    try {
      $presentation.Export($imageDir, 'JPG', 1440, 810)
      Write-Output ($design + ': ' + $presentation.Slides.Count + ' slides rendered')
    } finally {
      $presentation.Close()
      [Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) | Out-Null
    }
  }
} finally {
  if (-not $alreadyRunning -and $powerPoint.Presentations.Count -eq 0) { $powerPoint.Quit() }
  [Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint) | Out-Null
}

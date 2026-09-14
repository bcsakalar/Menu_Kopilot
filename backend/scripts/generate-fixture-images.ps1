# Renders synthetic menu photos and panel screenshots used by the e2e tests and live smoke tests.
# Text content comes from test/fixtures/images/menus.json (UTF-8) so this script stays ASCII-only.
# Windows only (System.Drawing). Run from backend/:  powershell -File scripts/generate-fixture-images.ps1
param(
  [string]$OutDir = (Join-Path $PSScriptRoot '..\test\fixtures\images')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$specPath = Join-Path $OutDir 'menus.json'
$spec = Get-Content -Raw -Encoding UTF8 $specPath | ConvertFrom-Json

function Get-JpegEncoder {
  [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
}

function Save-Jpeg([System.Drawing.Bitmap]$bmp, [string]$path, [int]$quality) {
  $params = New-Object System.Drawing.Imaging.EncoderParameters 1
  $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$quality)
  $bmp.Save($path, (Get-JpegEncoder), $params)
}

$ink = [System.Drawing.Brushes]::Black
$muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(110, 90, 70))
$accent = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(150, 40, 20))
$rule = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(150, 40, 20)), 3
$dots = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(170, 160, 150)), 2
$dots.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dot

foreach ($menu in $spec.menus) {
  $bmp = New-Object System.Drawing.Bitmap 1200, 1600
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::FromArgb(252, 247, 238))

  $titleFont = New-Object System.Drawing.Font 'Georgia', 46, ([System.Drawing.FontStyle]::Bold)
  $subFont = New-Object System.Drawing.Font 'Georgia', 22, ([System.Drawing.FontStyle]::Italic)
  $sectionFont = New-Object System.Drawing.Font 'Segoe UI', 30, ([System.Drawing.FontStyle]::Bold)
  $itemFont = New-Object System.Drawing.Font 'Segoe UI', 27
  $priceFont = New-Object System.Drawing.Font 'Segoe UI', 27, ([System.Drawing.FontStyle]::Bold)

  $center = New-Object System.Drawing.StringFormat
  $center.Alignment = [System.Drawing.StringAlignment]::Center
  $g.DrawString($menu.title, $titleFont, $accent, (New-Object System.Drawing.RectangleF 0, 50, 1200, 70), $center)
  $g.DrawString($menu.subtitle, $subFont, $muted, (New-Object System.Drawing.RectangleF 0, 125, 1200, 40), $center)
  $g.DrawLine($rule, 120, 185, 1080, 185)

  $y = 225
  foreach ($section in $menu.sections) {
    $g.DrawString($section.name, $sectionFont, $accent, 90, $y)
    $y += 58
    foreach ($item in $section.items) {
      $name = [string]$item[0]
      $price = [string]$item[1]
      $g.DrawString($name, $itemFont, $ink, 110, $y)
      $nameWidth = $g.MeasureString($name, $itemFont).Width
      $priceWidth = $g.MeasureString($price, $priceFont).Width
      $g.DrawLine($dots, 120 + $nameWidth, $y + 30, 1090 - $priceWidth, $y + 30)
      $g.DrawString($price, $priceFont, $ink, 1100 - $priceWidth, $y)
      $y += 50
    }
    $y += 26
  }

  Save-Jpeg $bmp (Join-Path $OutDir $menu.file) 88
  $g.Dispose(); $bmp.Dispose()
  Write-Output "wrote $($menu.file)"
}

foreach ($panel in $spec.panels) {
  $width = 1600
  $rowHeight = 86
  $top = 150
  $height = $top + ($panel.rows.Count * $rowHeight) + 20
  if ($panel.cutLastRow) { $height -= [int]($rowHeight * 0.55) }
  $bmp = New-Object System.Drawing.Bitmap $width, $height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $g.Clear([System.Drawing.Color]::White)

  $barBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(45, 55, 72))
  $headBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(237, 240, 245))
  $zebra = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(249, 250, 252))
  $grid = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(220, 224, 230)), 1
  $gray = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(120, 128, 140))
  $white = [System.Drawing.Brushes]::White
  $titleFont = New-Object System.Drawing.Font 'Segoe UI', 22, ([System.Drawing.FontStyle]::Bold)
  $headFont = New-Object System.Drawing.Font 'Segoe UI', 16, ([System.Drawing.FontStyle]::Bold)
  $cellFont = New-Object System.Drawing.Font 'Segoe UI', 17
  $nameFont = New-Object System.Drawing.Font 'Segoe UI', 18, ([System.Drawing.FontStyle]::Bold)

  $g.FillRectangle($barBrush, 0, 0, $width, 70)
  $g.DrawString($panel.title, $titleFont, $white, 30, 18)

  $titles = $spec.panelColumns
  $columns = @(
    @{ Title = [string]$titles[0]; X = 30; W = 380 },
    @{ Title = [string]$titles[1]; X = 420; W = 220 },
    @{ Title = [string]$titles[2]; X = 650; W = 470 },
    @{ Title = [string]$titles[3]; X = 1130; W = 150 },
    @{ Title = [string]$titles[4]; X = 1290; W = 170 },
    @{ Title = [string]$titles[5]; X = 1470; W = 120 }
  )
  $g.FillRectangle($headBrush, 0, 90, $width, 50)
  foreach ($col in $columns) { $g.DrawString($col.Title, $headFont, $gray, $col.X, 102) }

  $y = $top
  $i = 0
  foreach ($row in $panel.rows) {
    if ($i % 2 -eq 1) { $g.FillRectangle($zebra, 0, $y, $width, $rowHeight) }
    $g.DrawLine($grid, 0, $y, $width, $y)
    $g.DrawString([string]$row.name, $nameFont, $ink, $columns[0].X, $y + 26)
    $g.DrawString([string]$row.category, $cellFont, $gray, $columns[1].X, $y + 28)
    $desc = [string]$row.description
    if ($desc -eq '') {
      $g.DrawString([string]$spec.panelEmptyText, $cellFont, $gray, $columns[2].X, $y + 28)
    } else {
      $g.DrawString($desc, $cellFont, $ink, $columns[2].X, $y + 28)
    }
    $g.DrawString([string]$row.options, $cellFont, $ink, $columns[3].X, $y + 28)
    $g.DrawString([string]$row.removables, $cellFont, $ink, $columns[4].X, $y + 28)
    $g.DrawString([string]$row.price, $cellFont, $ink, $columns[5].X, $y + 28)
    $y += $rowHeight
    $i += 1
  }

  $bmp.Save((Join-Path $OutDir $panel.file), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Output "wrote $($panel.file)"
}

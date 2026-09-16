# Renders the PNG app icons from the same geometry as the Android vector mark
# (android/app/src/main/res/drawable/ic_launcher_foreground.xml, 108-unit canvas):
#   - Android legacy launcher icons (API < 26) in mipmap-*/ic_launcher.png, rounded square
#   - iOS AppIcon set, full-bleed square without alpha (iOS applies its own mask)
# Android 8+ uses the adaptive vector icon, so these PNGs only matter for old devices and iOS.
# Windows only (System.Drawing). Run from mobile/:  powershell -File scripts/generate-app-icons.ps1
param(
  [string]$ProjectDir = (Join-Path $PSScriptRoot '..')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$paprika = [System.Drawing.Color]::FromArgb(0xC2, 0x41, 0x0C)
$sparkle = [System.Drawing.Color]::FromArgb(0xFD, 0xE6, 0x8A)
$white = [System.Drawing.Color]::White

# The mark spans x 32..76.5 and y 27.5..80 on the 108-unit canvas; it is scaled to fill ~62% of the icon.
function Draw-Mark([System.Drawing.Graphics]$g, [double]$size) {
  $s = $size * 0.62 / 52.5
  $ox = $size / 2.0 - 54.25 * $s
  $oy = $size / 2.0 - 53.75 * $s
  function P([double]$x, [double]$y) { New-Object System.Drawing.PointF ([single]($ox + $x * $s)), ([single]($oy + $y * $s)) }

  $card = New-Object System.Drawing.Drawing2D.GraphicsPath
  $r = 5.0 * $s
  $left = $ox + 32 * $s; $top = $oy + 42 * $s; $right = $ox + 62 * $s; $bottom = $oy + 80 * $s
  $card.AddArc([single]$left, [single]$top, [single](2 * $r), [single](2 * $r), 180, 90)
  $card.AddArc([single]($right - 2 * $r), [single]$top, [single](2 * $r), [single](2 * $r), 270, 90)
  $card.AddArc([single]($right - 2 * $r), [single]($bottom - 2 * $r), [single](2 * $r), [single](2 * $r), 0, 90)
  $card.AddArc([single]$left, [single]($bottom - 2 * $r), [single](2 * $r), [single](2 * $r), 90, 90)
  $card.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush $white), $card)

  $pen = New-Object System.Drawing.Pen $paprika, ([single](4 * $s))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawLine($pen, (P 39 53), (P 55 53))
  $g.DrawLine($pen, (P 39 61.5), (P 51 61.5))
  $g.DrawLines($pen, [System.Drawing.PointF[]]@((P 39 70), (P 43 74), (P 51 66)))

  # Quadratic curves of the vector path as cubic Beziers (control points at 2/3).
  $star = New-Object System.Drawing.Drawing2D.GraphicsPath
  $points = @(@(68, 27.5), @(70.2, 33.8), @(76.5, 36), @(70.2, 38.2), @(68, 44.5), @(65.8, 38.2), @(59.5, 36), @(65.8, 33.8), @(68, 27.5))
  for ($i = 0; $i -lt 8; $i += 2) {
    $p0 = $points[$i]; $c = $points[$i + 1]; $p1 = $points[$i + 2]
    $c1x = $p0[0] + 2.0 / 3.0 * ($c[0] - $p0[0]); $c1y = $p0[1] + 2.0 / 3.0 * ($c[1] - $p0[1])
    $c2x = $p1[0] + 2.0 / 3.0 * ($c[0] - $p1[0]); $c2y = $p1[1] + 2.0 / 3.0 * ($c[1] - $p1[1])
    $star.AddBezier((P $p0[0] $p0[1]), (P $c1x $c1y), (P $c2x $c2y), (P $p1[0] $p1[1]))
  }
  $star.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush $sparkle), $star)
}

function New-Master([bool]$rounded) {
  $size = 1024
  $format = if ($rounded) { [System.Drawing.Imaging.PixelFormat]::Format32bppArgb } else { [System.Drawing.Imaging.PixelFormat]::Format24bppRgb }
  $bmp = New-Object System.Drawing.Bitmap $size, $size, $format
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $brush = New-Object System.Drawing.SolidBrush $paprika
  if ($rounded) {
    $g.Clear([System.Drawing.Color]::Transparent)
    $radius = 0.22 * $size
    $bg = New-Object System.Drawing.Drawing2D.GraphicsPath
    $bg.AddArc(0, 0, [single](2 * $radius), [single](2 * $radius), 180, 90)
    $bg.AddArc([single]($size - 2 * $radius), 0, [single](2 * $radius), [single](2 * $radius), 270, 90)
    $bg.AddArc([single]($size - 2 * $radius), [single]($size - 2 * $radius), [single](2 * $radius), [single](2 * $radius), 0, 90)
    $bg.AddArc(0, [single]($size - 2 * $radius), [single](2 * $radius), [single](2 * $radius), 90, 90)
    $bg.CloseFigure()
    $g.FillPath($brush, $bg)
  } else {
    $g.Clear($paprika)
  }
  Draw-Mark $g $size
  $g.Dispose()
  return $bmp
}

function Save-Scaled([System.Drawing.Bitmap]$master, [int]$size, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, $master.PixelFormat
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.DrawImage($master, 0, 0, $size, $size)
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "  $path ($size px)"
}

$res = Join-Path $ProjectDir 'android\app\src\main\res'
$android = New-Master $true
Write-Output 'Android legacy launcher icons'
foreach ($density in @(@('mdpi', 48), @('hdpi', 72), @('xhdpi', 96), @('xxhdpi', 144), @('xxxhdpi', 192))) {
  Save-Scaled $android $density[1] (Join-Path $res "mipmap-$($density[0])\ic_launcher.png")
}
$android.Dispose()

$iconSet = Join-Path $ProjectDir 'ios\Runner\Assets.xcassets\AppIcon.appiconset'
$contents = Get-Content -Raw (Join-Path $iconSet 'Contents.json') | ConvertFrom-Json
$ios = New-Master $false
Write-Output 'iOS app icons'
$done = @{}
foreach ($image in $contents.images) {
  if ($done.ContainsKey($image.filename)) { continue }
  $done[$image.filename] = $true
  $points = [double]($image.size -split 'x')[0]
  $scale = [double]($image.scale -replace 'x', '')
  Save-Scaled $ios ([int][Math]::Round($points * $scale)) (Join-Path $iconSet $image.filename)
}
$ios.Dispose()

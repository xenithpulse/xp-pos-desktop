<#
.SYNOPSIS
    Generates every XenithPulse brand asset the installer and the app need.

.DESCRIPTION
    The mark is a pulse waveform in emerald (#34D399) on near-black, matching the
    login page (app/globals.css: .xp-trace). Everything here is DERIVED from that
    one glyph so the icon, the wizard panels and the favicon cannot drift apart.

    Why a generator instead of checked-in binaries alone:

      - The outputs ARE checked in (build.ps1 must not depend on font rendering
        or on System.Drawing being present). This script is how they are
        REPRODUCED when the mark changes, so a future change is a one-line edit
        and a re-run rather than an archaeology exercise in a paint program.
      - Icons are rendered natively at every size, NOT downscaled from one large
        master. A stroke that looks right at 256px disappears at 16px; the stroke
        weight and the glow are therefore functions of the target size, and the
        glow is dropped entirely below 48px where it only turns to mud.

    Requires nothing but Windows: System.Drawing ships with .NET Framework, and
    the display font is read straight out of public/fonts.

.PARAMETER RepoRoot
    Repository root. Defaults to two levels up from this script.

.EXAMPLE
    .\installer\branding\make-branding.ps1
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$BrandDir = Join-Path $RepoRoot 'installer\branding'
$FontFile = Join-Path $RepoRoot 'public\fonts\LunaObscura.ttf'

if (-not (Test-Path $FontFile)) {
    throw "Brand display font not found: $FontFile"
}
New-Item -ItemType Directory -Force -Path $BrandDir | Out-Null

# PrivateFontCollection must outlive every path built from it - disposing it
# early corrupts glyphs that have not been rasterised yet.
$script:Fonts = New-Object System.Drawing.Text.PrivateFontCollection
$script:Fonts.AddFontFile($FontFile)
$script:Luna = $script:Fonts.Families[0]

# ---- palette -------------------------------------------------------------
# Emerald and ink are the login page's values. Do not "improve" them here in
# isolation; the point is that the installer and the running app match.
$Emerald   = [System.Drawing.Color]::FromArgb(255, 52, 211, 153)
$Ink       = [System.Drawing.Color]::FromArgb(255, 9, 14, 12)
$PanelTop  = [System.Drawing.Color]::FromArgb(255, 6, 10, 9)
$PanelBot  = [System.Drawing.Color]::FromArgb(255, 12, 20, 17)
$Chalk     = [System.Drawing.Color]::FromArgb(255, 233, 240, 237)
$Muted     = [System.Drawing.Color]::FromArgb(255, 122, 138, 132)

# ---- drawing helpers -----------------------------------------------------

function New-RoundedPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

function Set-Quality($g) {
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
}

# Scale and centre a path into a box using its real ink bounds. Glyph metrics
# differ per font, so measuring is the only way to land text predictably.
function Set-PathIntoBox($path, [single]$bx, [single]$by, [single]$bw, [single]$bh) {
    $b = $path.GetBounds()
    if ($b.Width -le 0 -or $b.Height -le 0) { return }
    $k = [Math]::Min($bw / $b.Width, $bh / $b.Height)
    $m = New-Object System.Drawing.Drawing2D.Matrix
    $m.Translate([single]($bx + ($bw - $b.Width * $k) / 2), [single]($by + ($bh - $b.Height * $k) / 2))
    $m.Scale([single]$k, [single]$k)
    $m.Translate([single](-$b.X), [single](-$b.Y))
    $path.Transform($m)
    $m.Dispose()
}

function New-TextPath([string]$text, $family, [single]$em) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddString($text, $family, 0, $em,
        (New-Object System.Drawing.PointF(0, 0)),
        [System.Drawing.StringFormat]::GenericTypographic)
    return $p
}

# The glyph: a pulse waveform across a box. Returns a GraphicsPath.
function New-PulsePath([single]$x, [single]$y, [single]$w, [single]$h) {
    $cy = $y + $h * 0.52
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddLines(@(
        (New-Object System.Drawing.PointF([single]($x + $w * 0.00), $cy)),
        (New-Object System.Drawing.PointF([single]($x + $w * 0.26), $cy)),
        (New-Object System.Drawing.PointF([single]($x + $w * 0.41), [single]($y + $h * 0.00))),
        (New-Object System.Drawing.PointF([single]($x + $w * 0.61), [single]($y + $h * 1.00))),
        (New-Object System.Drawing.PointF([single]($x + $w * 0.75), $cy)),
        (New-Object System.Drawing.PointF([single]($x + $w * 1.00), $cy))
    ))
    return $p
}

# Stroke a path in emerald over a soft glow.
#
# The glow is MANY low-alpha passes, not two or three heavy ones: a handful of
# wide passes reads as concentric bands (which looks like a rendering bug),
# whereas ~14 accumulating passes approximate a real gaussian bloom. Skipped
# entirely below 48px, where any glow at all just muddies the stroke.
function Add-GlowStroke($g, $path, [single]$w, [bool]$glow) {
    if ($glow) {
        for ($i = 14; $i -ge 1; $i--) {
            $mult = 1.0 + ($i / 14.0) * 1.9
            $pen = New-Object System.Drawing.Pen(
                [System.Drawing.Color]::FromArgb(7, 52, 211, 153), [single]($w * $mult))
            $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
            $pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
            $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
            $g.DrawPath($pen, $path)
            $pen.Dispose()
        }
    }
    $pen = New-Object System.Drawing.Pen($Emerald, $w)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawPath($pen, $path)
    $pen.Dispose()
}

# ---- the app icon, rendered natively at one size -------------------------

function New-IconBitmap([int]$s) {
    $bmp = New-Object System.Drawing.Bitmap($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    Set-Quality $g
    $g.Clear([System.Drawing.Color]::Transparent)

    $tile = New-RoundedPath 0 0 $s $s ([single]($s * 0.215))
    $brush = New-Object System.Drawing.SolidBrush($Ink)
    $g.FillPath($brush, $tile)
    $brush.Dispose()

    # A hairline rim separates the tile from a dark taskbar. Below 32px there
    # is no room for it and it only softens the silhouette.
    if ($s -ge 32) {
        $pen = New-Object System.Drawing.Pen(
            [System.Drawing.Color]::FromArgb(46, 52, 211, 153), [single]([Math]::Max(1, $s * 0.012)))
        $g.DrawPath($pen, $tile)
        $pen.Dispose()
    }
    $tile.Dispose()

    # The waveform is inset so its round caps never touch the tile edge.
    $pulse = New-PulsePath ([single]($s * 0.16)) ([single]($s * 0.28)) ([single]($s * 0.68)) ([single]($s * 0.44))
    Add-GlowStroke $g $pulse ([single]([Math]::Max(1.4, $s * 0.085))) ($s -ge 48)
    $pulse.Dispose()

    $g.Dispose()
    return $bmp
}

# ---- .ico container ------------------------------------------------------
#
# Written by hand because System.Drawing cannot produce a multi-resolution icon.
# A single-size .ico is visibly blurry in Explorer, which is the whole reason
# this file exists.
#
# Sizes up to 48px are stored as classic 32-bit DIBs and 256px as PNG. That is
# the Vista-era convention every Windows shell understands, and it avoids
# betting that the Inno compiler accepts PNG-compressed entries at small sizes.

function Get-BitmapBgra([System.Drawing.Bitmap]$bmp) {
    $rect = New-Object System.Drawing.Rectangle(0, 0, $bmp.Width, $bmp.Height)
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                          [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $bytes = New-Object byte[] ($data.Stride * $bmp.Height)
        [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
        return @{ Bytes = $bytes; Stride = $data.Stride }
    } finally {
        $bmp.UnlockBits($data)
    }
}

# BITMAPINFOHEADER + bottom-up BGRA rows + a padded (all-zero) AND mask.
# The mask is ignored for 32bpp icons but the structure is not optional.
function ConvertTo-IconDib([System.Drawing.Bitmap]$bmp) {
    $s = $bmp.Width
    $px = Get-BitmapBgra $bmp
    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)

    $bw.Write([uint32]40)          # biSize
    $bw.Write([int32]$s)           # biWidth
    $bw.Write([int32]($s * 2))     # biHeight - colour AND mask stacked
    $bw.Write([uint16]1)           # biPlanes
    $bw.Write([uint16]32)          # biBitCount
    $bw.Write([uint32]0)           # biCompression = BI_RGB
    $bw.Write([uint32]($s * $s * 4))
    $bw.Write([int32]0); $bw.Write([int32]0)
    $bw.Write([uint32]0); $bw.Write([uint32]0)

    for ($y = $s - 1; $y -ge 0; $y--) {
        $bw.Write($px.Bytes, $y * $px.Stride, $s * 4)
    }

    $maskRow = [int][Math]::Floor((($s + 31) / 32)) * 4
    [byte[]]$mask = New-Object byte[] ($maskRow * $s)
    $bw.Write($mask, 0, $mask.Length)

    $bw.Flush()
    [byte[]]$out = $ms.ToArray()
    $bw.Dispose(); $ms.Dispose()
    # Leading comma: PowerShell unrolls an array on output, so a bare `return
    # $out` hands back Object[] of bytes. BinaryWriter then misses its byte[]
    # overload and writes a single byte per entry, producing a 125-byte .ico
    # that Windows renders as nothing at all.
    return ,$out
}

function ConvertTo-PngBytes([System.Drawing.Bitmap]$bmp) {
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    [byte[]]$out = $ms.ToArray()
    $ms.Dispose()
    return ,$out
}

function Write-IcoFile([int[]]$Sizes, [string]$Path) {
    $entries = @()
    foreach ($s in ($Sizes | Sort-Object)) {
        $bmp = New-IconBitmap $s
        # 256 as PNG keeps the file small; anything else as a DIB keeps it
        # readable by every shell surface including legacy ones.
        $blob = if ($s -ge 256) { ConvertTo-PngBytes $bmp } else { ConvertTo-IconDib $bmp }
        $bmp.Dispose()
        $entries += @{ Size = $s; Blob = $blob }
    }

    $fs = [System.IO.File]::Create($Path)
    $bw = New-Object System.IO.BinaryWriter($fs)
    try {
        $bw.Write([uint16]0)                 # reserved
        $bw.Write([uint16]1)                 # type = icon
        $bw.Write([uint16]$entries.Count)

        $offset = 6 + 16 * $entries.Count
        foreach ($e in $entries) {
            # 256 is encoded as 0 in a single byte - that is the format, not a bug.
            $dim = if ($e.Size -ge 256) { 0 } else { $e.Size }
            $bw.Write([byte]$dim)            # width
            $bw.Write([byte]$dim)            # height
            $bw.Write([byte]0)               # palette entries
            $bw.Write([byte]0)               # reserved
            $bw.Write([uint16]1)             # planes
            $bw.Write([uint16]32)            # bits per pixel
            $bw.Write([uint32]$e.Blob.Length)
            $bw.Write([uint32]$offset)
            $offset += $e.Blob.Length
        }
        foreach ($e in $entries) { $bw.Write($e.Blob) }
    } finally {
        $bw.Dispose(); $fs.Dispose()
    }
    Write-Host ("  {0,-34} {1,3} sizes  {2,7:N0} bytes" -f (Split-Path -Leaf $Path), $entries.Count, (Get-Item $Path).Length)
}

# ---- Inno wizard panels --------------------------------------------------
#
# BMP, not PNG: Inno silently refuses PNGs here. 24bpp, because a 32bpp BMP with
# an alpha channel composites unpredictably in the wizard.

function Save-Bmp24([System.Drawing.Bitmap]$src, [string]$Path) {
    $flat = New-Object System.Drawing.Bitmap($src.Width, $src.Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($flat)
    Set-Quality $g
    $g.DrawImage($src, 0, 0, $src.Width, $src.Height)
    $g.Dispose()
    $flat.Save($Path, [System.Drawing.Imaging.ImageFormat]::Bmp)
    $flat.Dispose()
    Write-Host ("  {0,-34} {1}x{2}  {3,7:N0} bytes" -f (Split-Path -Leaf $Path), $src.Width, $src.Height, (Get-Item $Path).Length)
}

# The tall left panel on the welcome and finish pages: 164x314 at 1x.
function New-WizardLarge([int]$scale) {
    $w = 164 * $scale
    $h = 314 * $scale
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    Set-Quality $g

    $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $PanelTop, $PanelBot, 90.0)
    $g.FillRectangle($bg, $rect)
    $bg.Dispose()

    # A soft emerald bloom behind the mark, so the panel is not a flat black slab.
    $glowR = [single]($w * 0.72)
    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath.AddEllipse([single]($w / 2 - $glowR), [single]($h * 0.30 - $glowR), [single]($glowR * 2), [single]($glowR * 2))
    $pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
    $pgb.CenterColor = [System.Drawing.Color]::FromArgb(56, 52, 211, 153)
    $pgb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 52, 211, 153))
    $g.FillPath($pgb, $glowPath)
    $pgb.Dispose(); $glowPath.Dispose()

    # mark
    $pulse = New-PulsePath ([single]($w * 0.20)) ([single]($h * 0.20)) ([single]($w * 0.60)) ([single]($h * 0.13))
    Add-GlowStroke $g $pulse ([single](7.0 * $scale)) $true
    $pulse.Dispose()

    # product name
    $name = New-TextPath 'XP POS' $script:Luna 200
    Set-PathIntoBox $name ([single]($w * 0.12)) ([single]($h * 0.42)) ([single]($w * 0.76)) ([single]($h * 0.075))
    $brush = New-Object System.Drawing.SolidBrush($Chalk)
    $g.FillPath($brush, $name)
    $brush.Dispose(); $name.Dispose()

    # hairline rule
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 52, 211, 153), [single](1.0 * $scale))
    $g.DrawLine($pen, [single]($w * 0.30), [single]($h * 0.525), [single]($w * 0.70), [single]($h * 0.525))
    $pen.Dispose()

    # tagline - balances the panel, which is otherwise empty below the rule
    $tag = New-TextPath 'Point of Sale' $script:Luna 200
    Set-PathIntoBox $tag ([single]($w * 0.24)) ([single]($h * 0.560)) ([single]($w * 0.52)) ([single]($h * 0.026))
    $brush = New-Object System.Drawing.SolidBrush($Muted)
    $g.FillPath($brush, $tag)
    $brush.Dispose(); $tag.Dispose()

    # publisher, bottom
    $pub = New-TextPath 'XenithPulse' $script:Luna 200
    Set-PathIntoBox $pub ([single]($w * 0.18)) ([single]($h * 0.90)) ([single]($w * 0.64)) ([single]($h * 0.030))
    $brush = New-Object System.Drawing.SolidBrush($Muted)
    $g.FillPath($brush, $pub)
    $brush.Dispose(); $pub.Dispose()

    $g.Dispose()
    return $bmp
}

# The small badge top-right on every other page: 55x58 at 1x.
#
# Corners are filled WHITE rather than left transparent: the BMP has no alpha
# and the modern wizard's header is white, so white corners make the rounded
# tile read as rounded instead of as a black-cornered rectangle.
function New-WizardSmall([int]$scale) {
    $w = 55 * $scale
    $h = 58 * $scale
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    Set-Quality $g
    $g.Clear([System.Drawing.Color]::White)

    $side = [single]([Math]::Min($w, $h) * 0.94)
    $x = [single](($w - $side) / 2)
    $y = [single](($h - $side) / 2)
    $tile = New-RoundedPath $x $y $side $side ([single]($side * 0.215))
    $brush = New-Object System.Drawing.SolidBrush($Ink)
    $g.FillPath($brush, $tile)
    $brush.Dispose(); $tile.Dispose()

    $pulse = New-PulsePath ([single]($x + $side * 0.16)) ([single]($y + $side * 0.28)) ([single]($side * 0.68)) ([single]($side * 0.44))
    Add-GlowStroke $g $pulse ([single]([Math]::Max(1.6, $side * 0.085))) ($scale -ge 2)
    $pulse.Dispose()

    $g.Dispose()
    return $bmp
}

# ---- run -----------------------------------------------------------------

Write-Host ''
Write-Host 'XenithPulse branding' -ForegroundColor Green
Write-Host ''

# 16..256. Windows picks per surface: 16 in Explorer lists and the title bar,
# 32 on the desktop, 48 in Add/Remove Programs, 256 in extra-large view.
Write-IcoFile @(16, 24, 32, 48, 64, 128, 256) (Join-Path $BrandDir 'XP-POS.ico')

# The app's own favicon, from the same mark. Browser tabs on staff devices are
# a brand surface too, and the placeholder that was here was not ours.
Write-IcoFile @(16, 32, 48, 256) (Join-Path $RepoRoot 'app\favicon.ico')

# Inno 6 picks @2x/@3x automatically on high-DPI displays; without them the
# wizard is visibly soft on any modern laptop.
foreach ($scale in @(1, 2, 3)) {
    $suffix = if ($scale -eq 1) { '' } else { "@${scale}x" }

    $big = New-WizardLarge $scale
    Save-Bmp24 $big (Join-Path $BrandDir "WizardImage$suffix.bmp")
    $big.Dispose()

    $small = New-WizardSmall $scale
    Save-Bmp24 $small (Join-Path $BrandDir "WizardSmallImage$suffix.bmp")
    $small.Dispose()
}

# A PNG of the mark for any surface that wants one (docs, the connect card).
$png = New-IconBitmap 512
$png.Save((Join-Path $BrandDir 'XP-POS-mark.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$png.Dispose()
Write-Host ("  {0,-34} 512x512" -f 'XP-POS-mark.png')

$script:Fonts.Dispose()

Write-Host ''
Write-Host "Done. Assets are in $BrandDir" -ForegroundColor Green
Write-Host 'They are checked in; re-run this only when the mark changes.'
Write-Host ''

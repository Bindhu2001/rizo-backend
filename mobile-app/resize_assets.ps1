Add-Type -AssemblyName System.Drawing;

function Resize-Image {
    param (
        [string]$Path,
        [string]$OutputPath,
        [int]$Size = 1024,
        [System.Drawing.Color]$Background = [System.Drawing.Color]::White
    )
    if (-not (Test-Path $Path)) { return }
    $img = [System.Drawing.Image]::FromFile((Resolve-Path $Path));
    $newImg = New-Object System.Drawing.Bitmap($Size, $Size);
    $g = [System.Drawing.Graphics]::FromImage($newImg);
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality;
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality;
    $g.Clear($Background);
    
    $ratio = [Math]::Min($Size / $img.Width, $Size / $img.Height);
    $w = [int]($img.Width * $ratio);
    $h = [int]($img.Height * $ratio);
    $x = [int](($Size - $w) / 2);
    $y = [int](($Size - $h) / 2);
    
    $g.DrawImage($img, $x, $y, $w, $h);
    $newImg.Save((Resolve-Path .).Path + "\\" + $OutputPath, [System.Drawing.Imaging.ImageFormat]::Png);
    
    $g.Dispose();
    $newImg.Dispose();
    $img.Dispose();
}

# Icon (White background)
Resize-Image -Path "assets/icon.png" -OutputPath "assets/icon_fixed.png" -Background ([System.Drawing.Color]::White)
# Splash Icon (Transparent background)
Resize-Image -Path "assets/splash-icon.png" -OutputPath "assets/splash_fixed.png" -Background ([System.Drawing.Color]::Transparent)

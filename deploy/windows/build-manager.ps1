param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\..\node_modules\.cache\stepmark-server-manager')
)

$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $compiler -PathType Leaf)) {
    throw '需要 Windows .NET Framework C# 编译器。'
}
$directory = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$exe = Join-Path $directory 'StepMark-Server-Manager.exe'
$source = Join-Path $PSScriptRoot 'ServerManager.cs'
$options = @('/nologo','/target:winexe','/platform:anycpu','/optimize+','/codepage:65001','/utf8output',
    "/out:$exe",'/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Net.Http.dll','/r:System.Web.Extensions.dll')
& $compiler @options $source
if ($LASTEXITCODE -ne 0) { throw '服务器管理器编译失败。' }
$sha = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
"$sha  StepMark-Server-Manager.exe" | Set-Content -LiteralPath (Join-Path $directory 'SHA256SUMS.txt') -Encoding ascii
Write-Output $exe

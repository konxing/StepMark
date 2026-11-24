param([Parameter(Mandatory=$true)][string]$Email)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$webRoot = Join-Path $projectRoot 'apps\web'
$tsx = Join-Path $projectRoot 'node_modules\.bin\tsx.cmd'
if (!(Test-Path -LiteralPath $tsx -PathType Leaf)) { throw '请先安装项目依赖。' }
$password = Read-Host '本机账号密码，至少 12 个字符' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
$originalEncoding = $OutputEncoding
Push-Location -LiteralPath $webRoot
try {
    $OutputEncoding = [Text.UTF8Encoding]::new($false)
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) | & $tsx --tsconfig tsconfig.json scripts/create-local-account.ts $Email
    if ($LASTEXITCODE -ne 0) { throw '本机账号未建立。' }
}
finally {
    Pop-Location
    $OutputEncoding = $originalEncoding
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $password.Dispose()
}

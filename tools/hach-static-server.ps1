$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$logPath = Join-Path $PSScriptRoot 'server.log'
"[$(Get-Date -Format o)] starting server from $($root.Path)" | Add-Content -LiteralPath $logPath
$listener = [System.Net.Sockets.TcpListener]::new([Net.IPAddress]::Parse('127.0.0.1'), 5173)
$listener.Start()
"[$(Get-Date -Format o)] listening on http://127.0.0.1:5173/" | Add-Content -LiteralPath $logPath

$mimeTypes = @{
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png' = 'image/png'
  '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.svg' = 'image/svg+xml'
  '.ico' = 'image/x-icon'
}

$importMap = @'
    <script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script>
'@

try {
  while ($true) {
    $client = $null
    try {
      $client = $listener.AcceptTcpClient()
      $stream = $client.GetStream()
      $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()

      while (($line = $reader.ReadLine()) -ne $null -and $line -ne '') {}

      if (-not $requestLine) {
        $client.Close()
        continue
      }

      "[$(Get-Date -Format o)] $requestLine" | Add-Content -LiteralPath $logPath
      $requestPath = ($requestLine -split ' ')[1]
      $requestPath = [Uri]::UnescapeDataString(($requestPath -split '\?')[0])
      if ($requestPath -eq '/') {
        $requestPath = '/index.html'
      }

      $relative = $requestPath.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
      $filePath = [IO.Path]::GetFullPath((Join-Path $root $relative))
      if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        $publicPath = [IO.Path]::GetFullPath((Join-Path (Join-Path $root 'public') $relative))
        if ($publicPath.StartsWith((Join-Path $root 'public'), [StringComparison]::OrdinalIgnoreCase)) {
          $filePath = $publicPath
        }
      }

      if (-not $filePath.StartsWith($root.Path, [StringComparison]::OrdinalIgnoreCase)) {
        $body = [Text.Encoding]::UTF8.GetBytes('Forbidden')
        $header = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 403 Forbidden`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n")
        $stream.Write($header, 0, $header.Length)
        $stream.Write($body, 0, $body.Length)
        $client.Close()
        continue
      }

      if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        $body = [Text.Encoding]::UTF8.GetBytes('Not found')
        $header = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 404 Not Found`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n")
        $stream.Write($header, 0, $header.Length)
        $stream.Write($body, 0, $body.Length)
        $client.Close()
        continue
      }

      $extension = [IO.Path]::GetExtension($filePath).ToLowerInvariant()
      $contentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { 'application/octet-stream' }

      if ([IO.Path]::GetFileName($filePath).ToLowerInvariant() -eq 'index.html') {
        $html = [IO.File]::ReadAllText($filePath)
        $html = $html.Replace('</head>', "$importMap`n  </head>")
        $bytes = [Text.Encoding]::UTF8.GetBytes($html)
      } elseif ($extension -eq '.js') {
        $script = [IO.File]::ReadAllText($filePath)
        $script = $script.Replace('import.meta.env.BASE_URL', "'/'")
        $script = $script.Replace('import.meta.env.DEV', 'false')
        $bytes = [Text.Encoding]::UTF8.GetBytes($script)
      } else {
        $bytes = [IO.File]::ReadAllBytes($filePath)
      }

      $responseHeader = @(
        'HTTP/1.1 200 OK'
        "Content-Type: $contentType"
        'Cache-Control: no-store'
        "Content-Length: $($bytes.Length)"
        'Connection: close'
        ''
        ''
      ) -join "`r`n"

      $headerBytes = [Text.Encoding]::ASCII.GetBytes($responseHeader)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($bytes, 0, $bytes.Length)
      $client.Close()
    } catch {
      "[$(Get-Date -Format o)] ERROR $($_.Exception.Message)" | Add-Content -LiteralPath $logPath
      if ($client) {
        $client.Close()
      }
    }
  }
} finally {
  "[$(Get-Date -Format o)] stopping server" | Add-Content -LiteralPath $logPath
  $listener.Stop()
}

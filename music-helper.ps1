# Lit les contrôles média de Windows (le panneau « en cours de lecture » de Windows) pour savoir
# ce que joue n'importe quelle application : Spotify, Deezer, YouTube Music dans un navigateur…
# Écrit une ligne JSON à chaque changement et lit des commandes sur l'entrée standard :
#   play | pause | toggle | next | prev   [identifiant de l'application]
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  if (-not $task.Wait(3000)) { return $null }
  $task.Result
}
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$Manager = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$Props = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$mgr = Await ($Manager::RequestAsync()) $Manager

function Thumb($ref) {
  if (-not $ref) { return $null }
  try {
    $s = Await ($ref.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    if (-not $s) { return $null }
    # PowerShell perd le type WinRT du flux : on passe par la réflexion.
    $type = [Windows.Storage.Streams.IContentTypeProvider].GetProperty('ContentType').GetValue($s)
    $net = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream])).Invoke($null, @($s))
    $mem = New-Object System.IO.MemoryStream
    $net.CopyTo($mem)
    $net.Dispose()
    if ($mem.Length -gt 600000) { return $null }
    "data:$type;base64," + [Convert]::ToBase64String($mem.ToArray())
  } catch { $null }
}

$thumbs = @{}
$last = ''
$lastSent = [DateTime]::MinValue
# [Console]::In lit de façon bloquante : un StreamReader sur le flux brut lit vraiment en arrière-plan.
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
$pending = $stdin.ReadLineAsync()
while ($true) {
  # Commandes reçues d'Ambiance.
  while ($pending.IsCompleted) {
    $line = $pending.Result
    if ($null -eq $line) { exit }
    $parts = $line.Trim() -split ' ', 2
    $target = $mgr.GetCurrentSession()
    if ($parts.Count -gt 1 -and $parts[1]) {
      $target = $mgr.GetSessions() | Where-Object { $_.SourceAppUserModelId -eq $parts[1] } | Select-Object -First 1
    }
    if ($target) {
      try {
        switch ($parts[0]) {
          'play' { $null = Await ($target.TryPlayAsync()) ([bool]) }
          'pause' { $null = Await ($target.TryPauseAsync()) ([bool]) }
          'toggle' { $null = Await ($target.TryTogglePlayPauseAsync()) ([bool]) }
          'next' { $null = Await ($target.TrySkipNextAsync()) ([bool]) }
          'prev' { $null = Await ($target.TrySkipPreviousAsync()) ([bool]) }
        }
      } catch { }
    }
    $pending = $stdin.ReadLineAsync()
  }

  # État de toutes les sessions média.
  $current = $mgr.GetCurrentSession()
  $list = @()
  foreach ($s in $mgr.GetSessions()) {
    try {
      $p = Await ($s.TryGetMediaPropertiesAsync()) $Props
      $info = $s.GetPlaybackInfo()
      $tl = $s.GetTimelineProperties()
      $id = $s.SourceAppUserModelId
      $key = "$id|$($p.Title)|$($p.Artist)"
      if (-not $thumbs.ContainsKey($key)) {
        if ($thumbs.Count -gt 20) { $thumbs.Clear() }
        $thumbs[$key] = Thumb $p.Thumbnail
      }
      $list += [ordered]@{
        app = $id
        current = ($current -and $current.SourceAppUserModelId -eq $id)
        title = $p.Title
        artist = $p.Artist
        album = $p.AlbumTitle
        status = "$($info.PlaybackStatus)"
        canNext = $info.Controls.IsNextEnabled
        canPrev = $info.Controls.IsPreviousEnabled
        position = [int]$tl.Position.TotalSeconds
        duration = [int]$tl.EndTime.TotalSeconds
        thumb = $thumbs[$key]
      }
    } catch { }
  }
  # La position avance seule : on ne renvoie l'état que si autre chose a changé (ou toutes les 5 s).
  $sig = ($list | ForEach-Object { "$($_.app)|$($_.title)|$($_.status)|$($_.current)|$($_.thumb.Length)" }) -join ';'
  $now = [DateTime]::UtcNow
  if ($sig -ne $last -or ($now - $lastSent).TotalSeconds -ge 5) {
    $last = $sig
    $lastSent = $now
    [Console]::Out.WriteLine((ConvertTo-Json -Compress -Depth 4 @{ sessions = @($list) }))
    [Console]::Out.Flush()
  }
  Start-Sleep -Milliseconds 700
}

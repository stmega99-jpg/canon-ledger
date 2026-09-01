param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot "..\docs\hackathon-build\demo\takes.json")
)

$ErrorActionPreference = "Stop"

$resolvedConfig = (Resolve-Path -LiteralPath $ConfigPath).Path
$configDirectory = Split-Path -Parent $resolvedConfig
$config = Get-Content -Raw -LiteralPath $resolvedConfig | ConvertFrom-Json
$records = @()

foreach ($take in $config.takes) {
  $takeDirectory = Join-Path $configDirectory $take.id
  $audioDirectory = Join-Path $takeDirectory "audio"
  New-Item -ItemType Directory -Path $audioDirectory -Force | Out-Null

  $voice = New-Object -ComObject SAPI.SpVoice
  try {
    $matchingVoices = @($voice.GetVoices() | Where-Object {
      $_.GetDescription().StartsWith([string]$take.voice)
    })
    if ($matchingVoices.Count -ne 1) {
      throw "Expected exactly one SAPI voice matching '$($take.voice)', found $($matchingVoices.Count)."
    }
    $voice.Voice = $matchingVoices[0]
    $voice.Rate = [int]$take.rate
    $voice.Volume = 100

    for ($index = 0; $index -lt $take.segments.Count; $index += 1) {
      $number = ($index + 1).ToString("00")
      $outputPath = Join-Path $audioDirectory "$number.wav"
      $stream = New-Object -ComObject SAPI.SpFileStream
      try {
        $stream.Open($outputPath, 3, $false)
        $voice.AudioOutputStream = $stream
        [void]$voice.Speak([string]$take.segments[$index].narration)
      }
      finally {
        $stream.Close()
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($stream)
      }
      $records += [pscustomobject]@{
        take = [string]$take.id
        segment = $index + 1
        voice = [string]$take.voice
        rate = [int]$take.rate
        bytes = (Get-Item -LiteralPath $outputPath).Length
        path = $outputPath
      }
    }
  }
  finally {
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($voice)
  }
}

$records | ConvertTo-Json -Depth 4

$ErrorActionPreference='Stop'
$repo='F:\Codync\发版工\work\z15'; $out=$repo
$lock='F:/Qbot/work/shiyan-current-component-batches-20261111/content-batch.build.lock'
$token='z15fmt-'+[guid]::NewGuid().ToString('N').Substring(0,10)
function Run($tag,$workdir,$body){ $bat=Join-Path $out "$tag.bat"; $o=Join-Path $out "$tag.out"
  $t="@echo off`r`nchcp 65001 >nul`r`ncd /d ""$workdir""`r`n$body > ""$o"" 2>&1`r`necho %ERRORLEVEL% > ""$out\$tag.exit""`r`n"
  [IO.File]::WriteAllText($bat,$t,(New-Object Text.UTF8Encoding($false)))
  $sw=[Diagnostics.Stopwatch]::StartNew(); Start-Process cmd.exe -ArgumentList @('/d','/c',"`"$bat`"") -NoNewWindow -Wait
  $c=-1; $e=Join-Path $out "$tag.exit"; if(Test-Path $e){ $x=(Get-Content $e -Raw).Trim(); if($x -match '^-?\d+$'){$c=[int]$x} }
  @{exit=$c;seconds=[math]::Round($sw.Elapsed.TotalSeconds,1);out=$o} }
$acq=$false
try{
 for($i=0;$i -lt 30;$i++){ try{ $fs=[IO.FileStream]::new($lock,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None); $b=@{owner='fabangong';pid=$PID;token=$token;at=(Get-Date).ToString('o');task='codync-ours-z15-fmt-check'}|ConvertTo-Json -Compress; $by=[Text.Encoding]::UTF8.GetBytes($b); $fs.Write($by,0,$by.Length); $fs.Flush(); $fs.Close(); $acq=$true; break }catch{ Start-Sleep 3 } }
 if(-not $acq){ throw 'LOCK_BUSY' }
 $f=Run 'ffmt' "$repo\host" 'cargo +1.99.1 fmt'; "fmt exit=$($f.exit) $($f.seconds)s"
 $c=Run 'fcheck' "$repo\host" 'cargo +1.99.1 check --all-targets'; "check exit=$($c.exit) $($c.seconds)s"
} finally { if($acq){ try{ $cur=Get-Content $lock -Raw; if($cur.Contains($token)){ Remove-Item $lock -Force } }catch{} } }
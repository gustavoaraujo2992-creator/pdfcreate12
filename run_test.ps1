Start-Process node "server.mjs" -RedirectStandardOutput "server_log.txt" -RedirectStandardError "server_err.txt" -PassThru -NoNewWindow
Start-Sleep 2
node test_api.mjs > test_out.txt
Stop-Process -Name node -Force

@echo off
setlocal
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%~dp0wwwroot\index.html"
  exit /b
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%~dp0wwwroot\index.html"
  exit /b
)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
  start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "%~dp0wwwroot\index.html"
  exit /b
)
start "" "%~dp0wwwroot\index.html"

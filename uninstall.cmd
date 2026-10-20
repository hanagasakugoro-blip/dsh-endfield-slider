@echo off
cd /d "%~dp0"
node scripts/install-profile.mjs --uninstall
if errorlevel 1 pause

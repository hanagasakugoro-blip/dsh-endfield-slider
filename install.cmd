@echo off
cd /d "%~dp0"
node scripts/install-profile.mjs
if errorlevel 1 pause

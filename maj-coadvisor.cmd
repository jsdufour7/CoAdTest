@echo off
rem  ===========================================================
rem   CoAdvisor - mise a jour + relance en UN DOUBLE-CLIC.
rem   Enrobe maj-coadvisor.ps1 avec une politique d'execution
rem   locale (rien de permanent sur la machine).
rem  ===========================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0maj-coadvisor.ps1"
pause

@echo off
rem Bundled CLI entry on Windows: <install dir>\bin\runyard.cmd; the bin folder is added to the user's PATH.
rem Runs the CLI script with the app's own runtime (Electron as Node), so no Node install is needed.
rem ASCII ONLY in this file: on a DBCS code page (e.g. 936) a UTF-8 comment can swallow the line break.
setlocal
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0..\RunyardK3.exe" "%~dp0..\resources\runtime\runyard-cli.mjs" %*
exit /b %ERRORLEVEL%

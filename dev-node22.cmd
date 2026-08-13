@echo off
set "PATH=C:\Users\ababs\AppData\Local\nvm\v22.23.2;%PATH%"
cd /d "%~dp0"
"C:\Users\ababs\AppData\Local\nvm\v22.23.2\node.exe" "%~dp0node_modules\vite\bin\vite.js" dev

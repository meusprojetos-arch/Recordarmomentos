@echo off
title Recordar - Servidor de Desenvolvimento
cd /d "%~dp0"

echo Iniciando o servidor do Recordar...
echo.
echo Acesse no navegador: http://localhost:5173
echo Pressione Ctrl+C para encerrar.
echo.

call npx vite --open false

echo.
echo Servidor encerrado.
pause

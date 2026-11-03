@echo off
chcp 65001 >nul
title 医学生处方推演训练平台
cd /d "%~dp0"

rem 检查 8899 端口是否已被占用
netstat -ano | findstr ":8899 " | findstr LISTENING >nul
if %errorlevel%==0 (
    echo [提示] 服务已在运行，直接打开浏览器...
) else (
    echo [启动] 正在后台启动本地 HTTP 服务 (端口 8899)...
    start /b "" python -m http.server 8899 --bind 127.0.0.1 >nul 2>&1
    timeout /t 2 /nobreak >nul
)

echo [打开] 浏览器访问 http://127.0.0.1:8899/
start "" "http://127.0.0.1:8899/"
exit

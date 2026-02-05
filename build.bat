@echo off
chcp 65001 >nul
echo ============================================================
echo  打包 DOI Fix 插件为 .xpi 文件
echo ============================================================
echo.

cd /d "%~dp0"

:: 检查是否有 7-Zip
where 7z >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo 错误: 未找到 7-Zip，请先安装 7-Zip
    echo 下载地址: https://www.7-zip.org/
    pause
    exit /b 1
)

:: 删除旧的 xpi 文件
if exist "zotero-doi-fix.xpi" del "zotero-doi-fix.xpi"

:: 打包文件
echo 正在打包...
7z a -tzip "zotero-doi-fix.xpi" manifest.json bootstrap.js chrome\ icons\

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================================
    echo ✓ 打包成功！
    echo ============================================================
    echo.
    echo 文件位置: %CD%\zotero-doi-fix.xpi
    echo.
    echo 安装步骤:
    echo 1. 打开 Zotero
    echo 2. 工具 → 插件
    echo 3. 点击右上角齿轮图标 → "Install Plugin From File..."
    echo 4. 选择 zotero-doi-fix.xpi
    echo 5. 重启 Zotero
    echo.
) else (
    echo.
    echo ✗ 打包失败
)

pause

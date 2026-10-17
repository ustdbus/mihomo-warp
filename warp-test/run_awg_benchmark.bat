@echo off
setlocal enabledelayedexpansion
title Cloudflare WARP AWG Benchmark Tool
cd /d "%~dp0"

:CHECK_ENV
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python not found in system PATH.
    echo Please ensure Python is installed and added to PATH.
    echo.
    pause
    exit /b 1
)

:MENU
cls
echo =====================================================================
echo           Cloudflare WARP AWG Benchmark ^& Optimizer Tool
echo =====================================================================
echo.
echo  Notice: To test real physical connection latency, please ensure
echo         your local proxy (e.g. Karing) is temporarily paused or TUN disabled.
echo.
echo  [1] Local Fast Benchmark (~770 endpoints, ~10s, auto-generate configs)
echo  [2] Local Full IP Benchmark (all 3,810 IP pool, ~35s)
echo  [3] Remote Benchmark on Guangzhou VPS (100%% mainland direct line, ~15s)
echo  [4] Open Results Folder (local_results)
echo  [0] Exit
echo.
echo =====================================================================
set choice=
set /p choice="Please select option (0-4): "

if "%choice%"=="1" goto RUN_LOCAL_FAST
if "%choice%"=="2" goto RUN_LOCAL_FULL
if "%choice%"=="3" goto RUN_REMOTE_VPS
if "%choice%"=="4" goto OPEN_DIR
if "%choice%"=="0" exit /b 0
if not defined choice (
    echo Exiting...
    exit /b 0
)
goto MENU

:RUN_LOCAL_FAST
cls
echo ---------------------------------------------------------------------
echo Running Local Fast Benchmark (~770 endpoints)...
echo ---------------------------------------------------------------------
python local_awg_test.py --mode fast
echo.
echo Test completed. Press any key to return to menu...
pause >nul
goto MENU

:RUN_LOCAL_FULL
cls
echo ---------------------------------------------------------------------
echo Running Local Full IP Benchmark (3,810 endpoints)...
echo ---------------------------------------------------------------------
python local_awg_test.py --mode full --workers 64
echo.
echo Test completed. Press any key to return to menu...
pause >nul
goto MENU

:RUN_REMOTE_VPS
cls
echo ---------------------------------------------------------------------
echo Running Remote Benchmark on Guangzhou Mainland VPS...
echo ---------------------------------------------------------------------
python "C:\Users\Lenovo\.gemini\config\skills\remote-ssh\scripts\ssh_runner.py" --vps huaweicloud --cmd "cd /root/warp_test && python3 local_awg_test.py --mode fast"
if not exist "local_results" mkdir "local_results"
python "C:\Users\Lenovo\.gemini\config\skills\remote-ssh\scripts\ssh_runner.py" --vps huaweicloud --download "/root/local_results/local_test_report.txt" "local_results\gz_huawei_report.txt"
echo.
echo Remote test completed and report downloaded to local_results!
pause >nul
goto MENU

:OPEN_DIR
if not exist "local_results" mkdir "local_results"
start "" "local_results"
goto MENU

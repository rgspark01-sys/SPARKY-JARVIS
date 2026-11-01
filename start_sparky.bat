@echo off
cd /d "%~dp0"
if not exist .venv (
  py -3 -m venv .venv
)
call .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
echo.
echo SPARKY is starting. Keep this window open.
echo On this laptop open: http://127.0.0.1:5000
echo On Android use the laptop IPv4 address shown by ipconfig, port 5000.
echo.
python app.py
pause

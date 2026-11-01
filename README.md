# SPARKY — Advanced JARVIS-inspired assistant

This starter project follows the uploaded visual guide's core idea: a browser-based JARVIS screen, voice input/output, laptop status, safe app/folder launching, Wi-Fi controls, weather and headlines.

## What works in this version

- Windows laptop hosts the Flask server and performs supported local actions.
- Android phone connects to the same SPARKY screen over the same Wi-Fi.
- Browser voice input (Chrome/Edge support varies by device) and spoken replies.
- Groq-powered AI chat (requires your own Groq API key).
- CPU, RAM, disk and battery status.
- Allow-listed app/folder launch buttons.
- Wi-Fi on/off (may require running Windows terminal as Administrator).
- Current weather using Open-Meteo and BBC world headlines.

## Important differences from the PDF

The PDF's example uses Claude Code and a Claude plan. This starter uses Groq for the AI chat to continue the existing SPARKY/Groq approach. It does not silently use Claude or an OpenAI key. Website-building automation inside Claude is not included in this first safe starter; it can be added after the basic bridge works.

## Windows installation (beginner)

1. Install Python 3.11 or newer from https://www.python.org/downloads/ . During setup, tick **Add Python to PATH**.
2. Extract the ZIP file to a normal folder, for example `C:\SPARKY_JARVIS_Advanced`.
3. Open that folder. Copy `.env.example`, rename the copy to `.env`.
4. Open `.env` in Notepad. Paste your Groq key after `GROQ_API_KEY=`. Set a private `JARVIS_PIN` instead of `2468`. Save.
   - Get a key from https://console.groq.com/ . Never share it or upload `.env`.
5. Double-click `start_sparky.bat`. First run installs packages and may take a few minutes.
6. Keep the black terminal window open. On the laptop, open Chrome/Edge and visit `http://127.0.0.1:5000`.
7. Enter the PIN you set in `.env`. Allow microphone access when asked.

## Connect Android

1. Connect the phone and laptop to the same Wi-Fi network.
2. On Windows, press `Win + R`, type `cmd`, press Enter. Run `ipconfig`.
3. Find the active Wi-Fi adapter's **IPv4 Address** (for example `192.168.1.8`; use your actual address).
4. On Android Chrome, open `http://YOUR-LAPTOP-IP:5000` (replace with the real IPv4 address).
5. Enter the same SPARKY PIN. Allow microphone permission. Use Chrome's menu → **Add to Home screen** if available.

If Windows Firewall asks, allow Python on **Private networks only**. Do not expose port 5000 to the public internet. The Android browser needs the laptop to stay on and SPARKY's terminal window to remain open.

## Supported local actions

The app only launches the listed targets: Notepad, Calculator, File Explorer, Chrome, Claude, VS Code, Downloads, Documents and Desktop. It does not execute arbitrary AI-generated shell commands.

Wi-Fi toggle may fail without Administrator permission. If it fails, close SPARKY, open Command Prompt as Administrator, start the app again, and retry. Use Wi-Fi ON to reconnect.

## Troubleshooting

- `py is not recognized`: reinstall Python and enable Add Python to PATH.
- Browser cannot connect from Android: check same Wi-Fi, use the laptop IPv4 address, keep the server running, and allow Python through Windows Private firewall.
- Wrong PIN: check `JARVIS_PIN` in `.env`, restart the server, and refresh the browser.
- AI says key missing: check `.env` is named exactly `.env` (not `.env.txt`) and restart.
- Groq API error: verify key, account access and `GROQ_MODEL`; model availability can change.
- Mic not working: allow microphone permission; try Chrome; tap the mic instead of expecting an always-listening wake word.

## Security

- Change the default PIN before using the app.
- Keep `.env` private. Do not send it to anyone or include it in screenshots.
- Use only on a trusted home/private network. This is a beginner local-network project, not a hardened public server.
- Do not add arbitrary command execution or file deletion to the assistant.

import base64, zipfile, os, re, platform, subprocess, shutil, xml.etree.ElementTree as ET
from pathlib import Path
from flask import Flask, render_template, request, jsonify, session
from dotenv import load_dotenv
import requests
from pypdf import PdfReader

load_dotenv()
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024
app.secret_key = os.getenv("FLASK_SECRET", "change-this-secret-before-use")
PIN = os.getenv("JARVIS_PIN", "2468")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

SYSTEM_PROMPT = """You are SPARKY, a helpful JARVIS-inspired desktop assistant.
Reply clearly and briefly. Understand English, Tamil and Tanglish. Reply in the
language the user uses. You cannot directly control the computer from chat;
for supported laptop actions, ask the user to use the Actions panel/buttons.
Never claim an action was completed unless the app reports success."""

def authorized():
    supplied = request.headers.get("X-Jarvis-Pin", "")
    return supplied == PIN

@app.get("/")
def home():
    return render_template("index.html")

@app.get("/api/health")
def health():
    return jsonify(ok=True, name="SPARKY")

@app.post("/api/chat")
def chat():
    if not authorized():
        return jsonify(error="Wrong SPARKY PIN."), 401

    uploaded = request.files.get("file")
    if request.is_json:
        data = request.get_json(silent=True) or {}
    else:
        data = request.form

    message = str(data.get("message", "")).strip()[:4000]
    history = data.get("history", [])

    if not message and not uploaded:
        return jsonify(error="Type a message or attach a file."), 400

    if not GROQ_API_KEY:
        return jsonify(error="Groq API key is not configured."), 200

    safe_history = []
    for item in history[-8:]:
        if isinstance(item, dict) and item.get("role") in ("user", "assistant"):
            safe_history.append({
                "role": item["role"],
                "content": str(item.get("content", ""))[:2000]
            })

    user_content = message or "Please describe this image."
    model = GROQ_MODEL

    if uploaded:
        filename = uploaded.filename or ""
        extension = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        file_bytes = uploaded.read()

        if not file_bytes or len(file_bytes) > 50 * 1024 * 1024:
            return jsonify(error="File is empty or larger than 10 MB."), 400

        if extension in ("jpg", "jpeg", "png", "webp"):
            mime = uploaded.mimetype or "image/jpeg"
            if not mime.startswith("image/"):
                return jsonify(error="Invalid image file."), 400

            encoded = base64.b64encode(file_bytes).decode("utf-8")
            user_content = [
                {"type": "text", "text": message or "Describe this image."},
                {"type": "image_url", "image_url": {
                    "url": f"data:{mime};base64,{encoded}"
                }}
            ]
            model = "qwen/qwen3.8-27b"

        elif extension == "pdf":
            import io
            reader = PdfReader(io.BytesIO(file_bytes))
            document_text = "\n".join(
                page.extract_text() or "" for page in reader.pages
            )[:20000]
            if not document_text.strip():
                return jsonify(error="No readable text found in this PDF. Scanned PDFs need OCR."), 400
            user_content = (
                (message or "Summarise this PDF and explain its contents.")
                + "\n\nPDF CONTENT:\n" + document_text
            )

        elif extension == "docx":
            import io
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as doc:
                xml = ET.fromstring(doc.read("word/document.xml"))
            paragraphs = [
                "".join(node.text or "" for node in para.iter()
                        if node.tag.endswith("}t"))
                for para in xml.iter() if para.tag.endswith("}p")
            ]
            document_text = "\n".join(paragraphs)[:20000]
            if not document_text.strip():
                return jsonify(error="No readable text found in this DOCX."), 400
            user_content = (
                (message or "Summarise this Word document and explain its contents.")
                + "\n\nDOCX CONTENT:\n" + document_text
            )

        elif extension == "txt":
            document_text = file_bytes.decode("utf-8", errors="replace")[:20000]
            user_content = (
                (message or "Summarise this text file.")
                + "\n\nFILE CONTENT:\n" + document_text
            )
        else:
            return jsonify(error="Supported files: JPG, PNG, WEBP, PDF, DOCX and TXT."), 400

    messages = (
        [{"role": "system", "content": SYSTEM_PROMPT}]
        + safe_history
        + [{"role": "user", "content": user_content}]
    )

    try:
        r = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": 0.6,
                "max_tokens": 700
            },
            timeout=60
        )
        if not r.ok:
            return jsonify(error=f"Groq API error ({r.status_code}). Check model/API access."), 502

        answer = r.json()["choices"][0]["message"]["content"]
        return jsonify(reply=answer)

    except requests.RequestException:
        return jsonify(error="Internet or Groq server issue. Try again."), 502
    except Exception:
        app.logger.exception("SPARKY chat error")
        return jsonify(error="Unexpected AI response. Check the Termux terminal."), 500

@app.get("/api/status")
def status():
    if not authorized():
        return jsonify(error="Wrong PIN"), 401

    return jsonify(
        os=platform.platform(),
        cpu_percent=None,
        ram_percent=None,
        ram_gb=None,
        disk_percent=None,
        disk_free_gb=None,
        battery=None,
        wifi="Android - status unavailable"
    )

# Only these known applications/folders can be opened. No arbitrary shell commands.
APP_TARGETS = {
    "notepad": ["notepad.exe"],
    "calculator": ["calc.exe"],
    "file explorer": ["explorer.exe"],
    "chrome": ["cmd", "/c", "start", "", "chrome"],
    "claude": ["cmd", "/c", "start", "", "claude"],
    "vscode": ["cmd", "/c", "start", "", "code"],
    "downloads": ["explorer.exe", str(Path.home() / "Downloads")],
    "documents": ["explorer.exe", str(Path.home() / "Documents")],
    "desktop": ["explorer.exe", str(Path.home() / "Desktop")],
}

@app.post("/api/action")
def action():
    if not authorized():
        return jsonify(error="Wrong PIN"), 401
    data = request.get_json(silent=True) or {}
    name = str(data.get("action", "")).lower().strip()
    if platform.system() != "Windows":
        return jsonify(error="Laptop control actions are available when SPARKY runs on Windows."), 400
    try:
        if name in APP_TARGETS:
            subprocess.Popen(APP_TARGETS[name], shell=False)
            return jsonify(ok=True, message=f"Opened {name}.")
        if name in ("wifi_off", "wifi_on"):
            state = "disabled" if name == "wifi_off" else "enabled"
            result = subprocess.run(
                ["netsh", "interface", "set", "interface", "name=Wi-Fi", f"admin={state}"],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode != 0:
                return jsonify(error="Windows blocked this Wi-Fi change. Run the terminal as Administrator, then restart SPARKY."), 403
            return jsonify(ok=True, message=f"Wi-Fi {state}.")
        return jsonify(error="That action is not on the safe allowed list."), 400
    except FileNotFoundError:
        return jsonify(error=f"{name} was not found. Check that the app is installed."), 404
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.get("/api/weather")
def weather():
    city = request.args.get("city", "Chennai")[:80]
    try:
        geo = requests.get("https://geocoding-api.open-meteo.com/v1/search",
                           params={"name": city, "count": 1, "language": "en", "format": "json"}, timeout=12).json()
        places = geo.get("results", [])
        if not places:
            return jsonify(error="City not found. Try another city name."), 404
        p = places[0]
        forecast = requests.get("https://api.open-meteo.com/v1/forecast",
            params={"latitude": p["latitude"], "longitude": p["longitude"],
                    "current": "temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m",
                    "timezone": "auto"}, timeout=12).json()["current"]
        return jsonify(city=p["name"], country=p.get("country", ""),
                       temperature=forecast["temperature_2m"], feels=forecast["apparent_temperature"],
                       humidity=forecast["relative_humidity_2m"], wind=forecast["wind_speed_10m"])
    except Exception:
        return jsonify(error="Weather service unavailable. Check internet and retry."), 502

@app.get("/api/news")
def news():
    try:
        url = "https://feeds.bbci.co.uk/news/world/rss.xml"
        root = ET.fromstring(requests.get(url, timeout=12).content)
        items = []
        for item in root.findall(".//item")[:8]:
            items.append({"title": item.findtext("title", default=""),
                          "link": item.findtext("link", default="")})
        return jsonify(items=items)
    except Exception:
        return jsonify(error="News feed unavailable. Check internet and retry."), 502

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)

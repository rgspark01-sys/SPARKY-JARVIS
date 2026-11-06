import base64, zipfile, os, re, platform, subprocess, shutil, xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime
import sqlite3, json
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
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

SYSTEM_PROMPT = """You are SPARKY, a helpful JARVIS-inspired desktop assistant.
Reply clearly and briefly. Understand English, Tamil and Tanglish. Reply in the
language the user uses. You cannot directly control the computer from chat;
for supported laptop actions, ask the user to use the Actions panel/buttons.
Never claim an action was completed unless the app reports success."""

def authorized():
    return True


MEMORY_DB = Path(__file__).with_name("sparky_memory.db")

def init_memory_db():
    with sqlite3.connect(MEMORY_DB) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)

def save_memory(content):
    init_memory_db()
    with sqlite3.connect(MEMORY_DB) as conn:
        conn.execute(
            "INSERT INTO memories (content, created_at) VALUES (?, ?)",
            (content, datetime.now().astimezone().isoformat(timespec="seconds"))
        )

def get_saved_memories():
    init_memory_db()
    with sqlite3.connect(MEMORY_DB) as conn:
        return conn.execute(
            "SELECT content FROM memories ORDER BY id DESC LIMIT 20"
        ).fetchall()

def forget_memory(keyword):
    init_memory_db()
    with sqlite3.connect(MEMORY_DB) as conn:
        cursor = conn.execute(
            "DELETE FROM memories WHERE instr(lower(content), lower(?)) > 0",
            (keyword,)
        )
        return cursor.rowcount

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

    uploaded_files = request.files.getlist("files")
    if not uploaded_files:
        single = request.files.get("file")
        if single:
            uploaded_files = [single]
    uploaded_files = [f for f in uploaded_files if f and f.filename]

    if request.is_json:
        data = request.get_json(silent=True) or {}
    else:
        data = request.form

    message = str(data.get("message", "")).strip()[:4000]
    history = data.get("history", [])
    if isinstance(history, str):
        try:
            history = json.loads(history)
        except (ValueError, TypeError):
            history = []
    if not isinstance(history, list):
        history = []

    if not uploaded_files:
        remember_match = re.match(
            r"^remember (?:this|that)\s*:\s*(.+)$",
            message, re.IGNORECASE | re.DOTALL
        )
        forget_match = re.match(
            r"^forget this\s*:\s*(.+)$",
            message, re.IGNORECASE | re.DOTALL
        )

        if remember_match:
            content = remember_match.group(1).strip()
            if not content:
                return jsonify(error="Please provide something to remember."), 400
            if len(content) > 500:
                return jsonify(error="Memory must be 500 characters or less."), 400
            save_memory(content)
            return jsonify(reply="Saved to memory: " + content)

        if message.lower().strip() in (
            "what do you remember?", "what do you remember",
            "show my memories", "list memories"
        ):
            rows = get_saved_memories()
            if not rows:
                return jsonify(reply="I don't have any saved memories yet.")
            return jsonify(reply="Here are your saved memories:\n" +
                           "\n".join("- " + row[0] for row in rows))

        if forget_match:
            keyword = forget_match.group(1).strip()
            if not keyword:
                return jsonify(error="Tell me which memory to forget."), 400
            count = forget_memory(keyword)
            return jsonify(reply=(
                f"Deleted {count} matching memory/memories."
                if count else "I couldn't find a matching saved memory."
            ))

    if not message and not uploaded_files:
        return jsonify(error="Type a message or attach a file."), 400

    if not GROQ_API_KEY:
        return jsonify(error="Groq API key is not configured."), 200

    safe_history = []
    for item in history[-8:]:
        if isinstance(item, dict) and item.get("role") in ("user", "assistant"):
            safe_history.append({
                "role": item["role"],
                "content": str(item.get("content", ""))[:10000]
            })

    image_parts = []
    document_parts = []
    image_count = 0
    total_size = 0

    for uploaded in uploaded_files:
        filename = uploaded.filename or "unnamed"
        extension = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        file_bytes = uploaded.read()
        total_size += len(file_bytes)

        if not file_bytes:
            return jsonify(error=f"{filename}: file is empty."), 400
        if total_size > 50 * 1024 * 1024:
            return jsonify(error="Combined upload exceeds the 50 MB server limit."), 413

        if extension in ("jpg", "jpeg", "png", "webp"):
            if len(file_bytes) > 20 * 1024 * 1024:
                return jsonify(error=f"{filename}: image exceeds the 20 MB Vision limit."), 400
            if uploaded.mimetype and not uploaded.mimetype.startswith("image/"):
                return jsonify(error=f"{filename}: invalid image file."), 400
            image_count += 1
            if image_count > 3:
                return jsonify(error="Maximum 3 images per Vision request."), 400

            mime = uploaded.mimetype or (
                "image/png" if extension == "png" else
                "image/webp" if extension == "webp" else "image/jpeg"
            )
            encoded = base64.b64encode(file_bytes).decode("utf-8")
            image_parts.append({
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{encoded}"}
            })

        elif extension == "pdf":
            import io
            reader = PdfReader(io.BytesIO(file_bytes))
            extracted = "\n".join(page.extract_text() or "" for page in reader.pages)
            document_parts.append(f"PDF {filename}:\n{extracted[:20000]}")

        elif extension == "docx":
            import io
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as doc:
                xml = ET.fromstring(doc.read("word/document.xml"))
            paragraphs = [
                "".join(node.text or "" for node in para.iter()
                        if node.tag.endswith("}t"))
                for para in xml.iter() if para.tag.endswith("}p")
            ]
            document_parts.append(
                f"DOCX {filename}:\n" + "\n".join(paragraphs)[:20000]
            )

        elif extension == "txt":
            extracted = file_bytes.decode("utf-8", errors="replace")
            document_parts.append(f"TXT {filename}:\n{extracted[:20000]}")

        else:
            return jsonify(error=f"Unsupported file: {filename}. Use JPG, PNG, WEBP, PDF, DOCX or TXT."), 400

    document_text = "\n\n".join(document_parts)[:40000]
    if image_parts:
        prompt = message or "Describe and analyse the attached images."
        if document_text:
            prompt += "\n\nAttached document contents:\n" + document_text
        user_content = [{"type": "text", "text": prompt}] + image_parts
        model = "qwen/qwen3.8-27b"
    elif document_text:
        user_content = (
            (message or "Analyse and explain the attached documents.")
            + "\n\n" + document_text
        )
        model = GROQ_MODEL
    else:
        user_content = message
        model = GROQ_MODEL

    saved_rows = get_saved_memories()
    memory_context = "\n".join("- " + row[0] for row in saved_rows)
    system_content = SYSTEM_PROMPT
    if memory_context:
        system_content += "\n\nUser-approved saved memories:\n" + memory_context

    messages = (
        [{"role": "system", "content": system_content}]
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
                "max_tokens": 10000
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

    try:
        battery_result = subprocess.run(
            ["termux-battery-status"],
            capture_output=True,
            text=True,
            timeout=5,
            check=True
        )
        battery_data = json.loads(battery_result.stdout)
        battery = {
            "percent": battery_data.get("percentage"),
            "plugged": battery_data.get("plugged") in ("PLUGGED", "AC", "USB", "WIRELESS"),
            "status": battery_data.get("status"),
            "health": battery_data.get("health")
        }
    except Exception:
        battery = None

    return jsonify(
        os=platform.platform(),
        cpu_percent=None,
        ram_percent=None,
        ram_gb=None,
        disk_percent=None,
        disk_free_gb=None,
        battery=battery,
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
    if name in ("flashlight_on", "flashlight_off"):
        command = "on" if name == "flashlight_on" else "off"
        if not shutil.which("termux-torch"):
            return jsonify(error="Termux:API flashlight command unavailable."), 501
        result = subprocess.run(
            ["termux-torch", command],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode != 0:
            return jsonify(error="Flashlight command failed. Check Termux:API permission."), 500
        return jsonify(ok=True, message=f"Flashlight {command}.")

    if name == "vibrate":
        if not shutil.which("termux-vibrate"):
            return jsonify(error="Termux:API vibration command unavailable."), 501
        subprocess.run(
            ["termux-vibrate", "-d", "500"],
            capture_output=True, text=True, timeout=5, check=True
        )
        return jsonify(ok=True, message="SPARKY vibration activated.")

    if name in ("volume_up", "volume_down", "volume_mute"):
        if not shutil.which("termux-volume"):
            return jsonify(error="Termux:API volume command unavailable."), 501

        try:
            result = subprocess.run(
                ["termux-volume"],
                capture_output=True, text=True, timeout=5, check=True
            )
            streams = json.loads(result.stdout)
            music = next(x for x in streams if x["stream"] == "music")
            current = int(music["volume"])
            maximum = int(music["max_volume"])

            if name == "volume_up":
                target = min(current + 1, maximum)
            elif name == "volume_down":
                target = max(current - 1, 0)
            else:
                target = 0 if current > 0 else max(1, maximum // 2)

            subprocess.run(
                ["termux-volume", "music", str(target)],
                capture_output=True, text=True, timeout=5, check=True
            )
            return jsonify(ok=True, message=f"Music volume: {target}/{maximum}")

        except Exception:
            return jsonify(error="Volume control failed. Check Termux:API."), 500

    if platform.system() != "Windows":
        return jsonify(error="This action is available only on Windows or supported Android controls."), 400
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

@app.get("/api/notifications")
def notifications():
    if not authorized():
        return jsonify(error="Wrong PIN"), 401

    try:
        result = subprocess.run(
            ["termux-notification-list"],
            capture_output=True,
            text=True,
            timeout=15,
            check=True
        )

        items = json.loads(result.stdout)
        safe_items = []

        for item in items:
            title = str(item.get("title", ""))[:300]
            content = str(item.get("content", ""))[:1500]

            if title or content:
                safe_items.append({
                    "app": str(item.get("packageName", "Unknown"))[:150],
                    "title": title,
                    "content": content,
                    "when": str(item.get("when", ""))[:60]
                })

        return jsonify(notifications=safe_items[:30])

    except Exception:
        app.logger.exception("Notification reader error")
        return jsonify(error="Could not read Android notifications."), 500


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



@app.post("/api/open-app")
def open_app():
    if not authorized():
        return jsonify(error="Wrong SPARKY PIN."), 401

    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify(error="Local access only."), 403

    data = request.get_json(silent=True) or {}
    app_name = str(data.get("app", "")).strip().lower()

    apps = {
        "whatsapp": "com.whatsapp/.Main"
    }

    component = apps.get(app_name)
    if not component:
        return jsonify(error="App not supported yet."), 400

    try:
        result = subprocess.run(
            ["am", "start", "-n", component],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            return jsonify(error="Could not open app."), 500
        return jsonify(ok=True, message="Opening WhatsApp.")
    except Exception:
        return jsonify(error="Android launch failed."), 500

@app.get("/api/sms")
def read_sms():
    if not authorized():
        return jsonify(error="Wrong PIN"), 401

    try:
        result = subprocess.run(
            ["termux-sms-list", "-l", "10"],
            capture_output=True,
            text=True,
            timeout=20,
            check=True
        )

        items = json.loads(result.stdout)
        safe_items = []

        for item in items[:10]:
            safe_items.append({
                "sender": str(item.get("number", "Unknown"))[:80],
                "message": str(item.get("body", ""))[:1000],
                "date": str(item.get("received", item.get("date", "")))[:80]
            })

        return jsonify(messages=safe_items)

    except Exception:
        app.logger.exception("SMS reader error")
        return jsonify(error="Could not read SMS messages."), 500




@app.route("/api/system/v12")
def v12_system():
    import os, platform, shutil, time
    try:
        disk = shutil.disk_usage(os.path.expanduser("~"))
        data = {
            "status": "ONLINE",
            "assistant": "SPARKY",
            "version": "V12",
            "platform": platform.platform(),
            "python": platform.python_version(),
            "cpu_count": os.cpu_count(),
            "memory": "Android system information restricted",
            "storage_total_gb": round(disk.total / (1024**3), 2),
            "storage_free_gb": round(disk.free / (1024**3), 2),
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        return jsonify(data)
    except Exception as e:
        return jsonify({"status":"ERROR","message":str(e)}), 500




@app.route("/api/vision/status")
def v14_vision_status():
    import os
    return jsonify({
        "assistant": "SPARKY",
        "version": "V14",
        "vision_model": os.getenv("GROQ_VISION_MODEL", "qwen/qwen3.8-27b"),
        "image_analysis": True,
        "pdf_reader": "available" if "PdfReader" in globals() else "unavailable",
        "upload_limit_mb": 50,
        "status": "VISION MODULE ONLINE"
    })




@app.route("/api/memory/v15", methods=["GET", "POST"])
def v15_memory_api():
    import sqlite3, time
    if not authorized():
        return jsonify({"error": "Wrong PIN"}), 401
    db = sqlite3.connect("sparky_memory.db")
    db.execute("""CREATE TABLE IF NOT EXISTS v15_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )""")
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        content = str(data.get("content", "")).strip()[:5000]
        category = str(data.get("category", "general")).strip()[:80]
        if not content:
            db.close()
            return jsonify({"error": "Memory content required"}), 400
        db.execute("INSERT INTO v15_memory(category,content,created_at) VALUES(?,?,?)",
                   (category, content, int(time.time())))
        db.commit()
        db.close()
        return jsonify({"status": "saved", "message": "SPARKY memory saved"})
    rows = db.execute("SELECT id,category,content,created_at FROM v15_memory ORDER BY id DESC LIMIT 100").fetchall()
    db.close()
    return jsonify({"status": "online", "count": len(rows), "memories": [
        {"id":r[0],"category":r[1],"content":r[2],"created_at":r[3]} for r in rows
    ]})



# SPARKY_V16_SECURITY_SHIELD
@app.after_request
def sparky_v16_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=(self)"
    response.headers["Cache-Control"] = "no-store"
    return response


# SPARKY_V17_SMART_ROUTER
@app.route("/api/assistant/command", methods=["POST"])
def sparky_v17_command():
    data = request.get_json(silent=True) or {}
    phrase = str(data.get("command", "")).lower().strip()
    intents = {
        "flashlight_on": ("flashlight on", "torch on", "turn on flashlight"),
        "flashlight_off": ("flashlight off", "torch off", "turn off flashlight"),
        "volume_up": ("volume up", "increase volume", "sound up"),
        "volume_down": ("volume down", "decrease volume", "sound down"),
        "volume_mute": ("mute", "volume mute", "silence"),
        "vibrate": ("vibrate", "make vibration", "vibration")
    }
    target = next((name for name, phrases in intents.items()
                   if any(term in phrase for term in phrases)), None)
    if not target:
        return jsonify({"status":"unsupported","message":"Command not recognized"}), 400
    with app.test_request_context("/api/action", method="POST",
                                  json={"action":target},
                                  headers=dict(request.headers)):
        return action()


# SPARKY_V20_AI_DIAGNOSTICS
@app.route("/api/ai/diagnostics")
def sparky_v20_ai_diagnostics():
    if not authorized():
        return jsonify({"error": "Wrong PIN"}), 401
    import os
    key = os.getenv("GROQ_API_KEY", "")
    return jsonify({
        "assistant": "SPARKY",
        "version": "V20",
        "provider": "Groq",
        "api_key_configured": bool(key.strip()),
        "model": os.getenv("GROQ_MODEL", "not configured"),
        "status": "CONFIGURED" if key.strip() else "API KEY MISSING"
    })


# SPARKY_V21_UNIFIED_INTEGRATION
@app.route("/api/system/overview")
def sparky_v21_overview():
    import os, shutil
    routes = sorted(str(rule) for rule in app.url_map.iter_rules())
    return jsonify({
        "assistant": "SPARKY",
        "version": "V21",
        "status": "ONLINE",
        "modules": {
            "ai": bool(os.getenv("GROQ_API_KEY", "").strip()),
            "memory_database": os.path.exists("sparky_memory.db"),
            "vision_reader": "PdfReader" in globals(),
            "termux_torch": bool(shutil.which("termux-torch")),
            "termux_vibrate": bool(shutil.which("termux-vibrate")),
            "automation_api": "/api/automation/run" in routes,
            "voice_ui": os.path.exists("static/app.js"),
            "hologram_ui": os.path.exists("static/hologram.js")
        },
        "registered_api_routes": [r for r in routes if r.startswith("/api/")]
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)

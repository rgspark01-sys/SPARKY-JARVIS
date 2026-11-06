const $ = id => document.getElementById(id);
const history = [];
function headers(){return {"Content-Type":"application/json"};}
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600);}
function addBubble(text,who){
  const d=document.createElement("div");
  d.className="bubble "+who;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);

  const inline = s => esc(s)
    .replace(/`([^`]+)`/g,"<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,"<em>$1</em>");

  const lines = String(text).split("\n");
  let html="", table=false, list=false;

  for(const line of lines){
    const t=line.trim();

    if(t.startsWith("|") && t.endsWith("|")){
      if(list){html+="</ul>";list=false;}
      if(!table){html+="<table><tbody>";table=true;}
      if(/^\|[\s:|-]+\|$/.test(t)) continue;
      const cells=t.split("|").slice(1,-1);
      html+="<tr>"+cells.map(c=>"<td>"+inline(c.trim())+"</td>").join("")+"</tr>";
      continue;
    }

    if(table){html+="</tbody></table>";table=false;}

    if(/^[-*]\s+/.test(t)){
      if(!list){html+="<ul>";list=true;}
      html+="<li>"+inline(t.replace(/^[-*]\s+/,""))+"</li>";
    }else{
      if(list){html+="</ul>";list=false;}
      if(t.startsWith("### ")) html+="<h3>"+inline(t.slice(4))+"</h3>";
      else if(t.startsWith("## ")) html+="<h2>"+inline(t.slice(3))+"</h2>";
      else if(t.startsWith("# ")) html+="<h1>"+inline(t.slice(2))+"</h1>";
      else if(t==="---") html+="<hr>";
      else if(t) html+="<p>"+inline(t)+"</p>";
    }
  }

  if(table) html+="</tbody></table>";
  if(list) html+="</ul>";

  d.innerHTML=html;
  $("chatLog").appendChild(d);
  $("chatLog").scrollTop=$("chatLog").scrollHeight;
}
async function sendMessage(text, voiceReply=false){
  text=(text||$("message").value).trim();
  if(text || selectedFiles.length) window.SparkyHologram?.setState("thinking");

  const appMatch = text.toLowerCase().replace(/^sparky[ ,]+/, "").match(/^open\s+whatsapp$/);
  if(appMatch){
    $("message").value="";
    addBubble(text,"user");
    try{
      const r=await fetch("/api/open-app",{
        method:"POST",
        headers:headers(),
        body:JSON.stringify({app:"whatsapp"})
      });
      const d=await r.json();
      if(!r.ok) throw Error(d.error||"Could not open WhatsApp");
      addBubble(d.message,"bot");
      if(voiceReply) speak(d.message, startCallListening);
    }catch(e){
      addBubble("App launch failed: "+e.message,"bot");
    }
    return;
  }

  if(!text && !selectedFiles.length)return;

  const filesToSend = [...selectedFiles];
  const displayText = text || "Please analyse the attached files.";
  $("message").value="";
  addBubble(displayText + (filesToSend.length ? " 📎 " + filesToSend.map(f=>f.name).join(", ") : ""), "user");
  history.push({role:"user",content:displayText});
  saveChatHistory();
  $("sendBtn").disabled=true;

  try{
    const form = new FormData();
    form.append("message", text);
    form.append("history", JSON.stringify(history.slice(-8,-1)));
    filesToSend.forEach(file => form.append("files", file));

    const r=await fetch("/api/chat",{
      method:"POST",
      headers:{},
      body:form
    });

    const d=await r.json();
    if(!r.ok)throw Error(d.error||"Upload failed");

    addBubble(d.reply,"bot");
    if(voiceReply) speak(d.reply, startCallListening); 
    history.push({role:"assistant",content:d.reply});
    saveChatHistory();

    if(filesToSend.length){
      selectedFiles=[];
      $("attachmentPreview").textContent="";
      $("fileInput").value="";
      $("cameraInput").value="";
    }
  }
  catch(e){
    addBubble(e.message,"bot");
    saveChatHistory();
  }
  finally{
    if(!voiceReply) window.SparkyHologram?.setState("idle");
    $("sendBtn").disabled=false;
  }
}
$("sendBtn").onclick=()=>sendMessage();
$("message").addEventListener("keydown",e=>{if(e.key==="Enter")sendMessage();});
let callActive = false;
let callBusy = false;
let speechActive = false;

function speak(text, onDone){
  if(!("speechSynthesis" in window)){
    if(onDone) onDone();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-IN";
  u.rate = 1;
  speechActive = true;

  u.onstart = () => {
    window.SparkyHologram?.setState("speaking");
  };

  u.onboundary = () => {
    window.SparkyHologram?.pulseMouth?.();
  };

  u.onend = () => {
    speechActive = false;
    window.SparkyHologram?.setState("idle");
    if(onDone) onDone();
  };
  u.onerror = () => {
    speechActive = false;
    window.SparkyHologram?.setState("idle");
    if(onDone) onDone();
  };
  window.speechSynthesis.speak(u);
}
async function loadStatus(){
 try{const r=await fetch("/api/status",{headers:headers()});const d=await r.json();if(!r.ok)throw Error(d.error);
 $("cpu").textContent=d.cpu_percent+"%";$("ram").textContent=d.ram_percent+"%";$("disk").textContent=d.disk_percent+"%";
 $("cpuBar").style.width=d.cpu_percent+"%";$("ramBar").style.width=d.ram_percent+"%";$("diskBar").style.width=d.disk_percent+"%";
 $("battery").textContent=d.battery?d.battery.percent+"%":"N/A";
 $("batteryInfo").textContent=d.battery?(d.battery.plugged?"Charging":"On battery"):"No battery detected";
 $("wifi").textContent=d.wifi;
 }catch(e){toast(e.message);}
}
$("refreshBtn").onclick=loadStatus;
document.querySelectorAll("[data-action]").forEach(b=>b.onclick=async()=>{
 try{const r=await fetch("/api/action",{method:"POST",headers:headers(),body:JSON.stringify({action:b.dataset.action})});const d=await r.json();if(!r.ok)throw Error(d.error);toast(d.message);}
 catch(e){toast(e.message);}
});
$("notificationsBtn").onclick=async()=>{
 const box=$("notificationList");
 box.textContent="Loading notifications...";
 try{
  const r=await fetch("/api/notifications",{headers:headers()});
  const d=await r.json();
  if(!r.ok)throw Error(d.error||"Could not load notifications.");

  box.replaceChildren();

  if(!d.notifications || d.notifications.length===0){
   box.textContent="No notifications found.";
   return;
  }

  d.notifications.forEach(item=>{
   const card=document.createElement("div");
   card.style.padding="10px";
   card.style.marginBottom="8px";
   card.style.borderBottom="1px solid var(--border, #444)";

   const app=document.createElement("small");
   app.textContent=item.app||"Android app";

   const title=document.createElement("b");
   title.textContent=item.title||"Notification";
   title.style.display="block";

   const content=document.createElement("p");
   content.textContent=item.content||"";
   content.style.margin="5px 0";

   const dateTime=document.createElement("small");
   const rawTime=String(item.when||"").trim();
   const date=new Date(rawTime.includes(" ") ? rawTime.replace(" ","T") : rawTime);

   if(rawTime && !Number.isNaN(date.getTime())){
    dateTime.textContent=date.toLocaleString("en-IN",{
     weekday:"long",
     day:"2-digit",
     month:"short",
     year:"numeric",
     hour:"2-digit",
     minute:"2-digit",
     second:"2-digit",
     hour12:true
    });
   }else{
    dateTime.textContent="Date and time unavailable";
   }

   dateTime.style.display="block";
   dateTime.style.opacity="0.7";
   card.append(app,title,content,dateTime);
   box.appendChild(card);
  });
 }catch(e){
  box.textContent=e.message;
 }
};

$("readNotificationsBtn").onclick=async()=>{
 const btn=$("readNotificationsBtn");
 btn.disabled=true;
 btn.textContent="🔊 READING...";
 try{
  const r=await fetch("/api/notifications",{headers:headers()});
  const d=await r.json();
  if(!r.ok)throw Error(d.error||"Could not load notifications.");

  if(!d.notifications || d.notifications.length===0){
   speak("You have no notifications.");
   return;
  }

  const messages=d.notifications.slice(0,10).map(item=>{
   const app=String(item.app||"an app");
   const title=String(item.title||"");
   const content=String(item.content||"");
   return "Notification from "+app+". "+title+". "+content;
  });

  speak("You have "+messages.length+" recent notifications. "+messages.join(". "));
 }catch(e){
  toast(e.message);
 }finally{
  btn.disabled=false;
  btn.textContent="🔊 READ ALOUD";
 }
};


let autoNotifyEnabled = false;
let autoNotifyTimer = null;
let knownNotificationIds = new Set();
let notificationCheckBusy = false;

function notificationId(item){
 return String(item.key || item.id || [
  item.packageName, item.title, item.content, item.when
 ].join("|"));
}

async function checkNewNotifications(){
 if(!autoNotifyEnabled || notificationCheckBusy) return;

 notificationCheckBusy = true;
 try{
  const r = await fetch("/api/notifications",{headers:headers()});
  const d = await r.json();
  if(!r.ok) throw Error(d.error || "Notification check failed.");

  const items = d.notifications || [];
  const fresh = items.filter(item =>
   !knownNotificationIds.has(notificationId(item))
  );

  items.forEach(item => knownNotificationIds.add(notificationId(item)));

  if(fresh.length && autoNotifyEnabled){
   const item = fresh[0];
   const app = String(item.app || "an app");
   const title = String(item.title || "New notification");
   const content = String(item.content || "");

   speak("New notification from " + app + ". " + title + ". " + content);
  }
 }catch(e){
  console.log("Notification check:", e.message);
 }finally{
  notificationCheckBusy = false;
 }
}

$("autoNotifyBtn").onclick = async()=>{
 const btn = $("autoNotifyBtn");

 if(autoNotifyEnabled){
  autoNotifyEnabled = false;
  clearInterval(autoNotifyTimer);
  autoNotifyTimer = null;
  btn.textContent = "🔔 AUTO ANNOUNCE: OFF";
  toast("Automatic announcements stopped.");
  return;
 }

 btn.disabled = true;
 btn.textContent = "PLEASE WAIT...";
 try{
  const r = await fetch("/api/notifications",{headers:headers()});
  const d = await r.json();
  if(!r.ok) throw Error(d.error || "Could not read notifications.");

  knownNotificationIds = new Set(
   (d.notifications || []).map(notificationId)
  );

  autoNotifyEnabled = true;
  autoNotifyTimer = setInterval(checkNewNotifications, 15000);
  btn.textContent = "🔔 AUTO ANNOUNCE: ON";
  toast("Automatic announcements enabled.");
 }catch(e){
  toast(e.message);
  btn.textContent = "🔔 AUTO ANNOUNCE: OFF";
 }finally{
  btn.disabled = false;
 }
};


async function loadSms(){
 const box = $("smsList");
 box.textContent = "Loading SMS messages...";

 try{
  const r = await fetch("/api/sms",{headers:headers()});
  const d = await r.json();

  if(!r.ok) throw Error(d.error || "Could not load SMS.");

  box.replaceChildren();

  const messages = d.messages || [];

  if(messages.length === 0){
   box.textContent = "No SMS messages found.";
   return messages;
  }

  messages.forEach(item=>{
   const card = document.createElement("div");
   card.className = "notification-item";

   const sender = document.createElement("strong");
   sender.textContent = "From: " + String(item.sender || "Unknown");

   const body = document.createElement("p");
   body.textContent = String(item.message || "");

   const date = document.createElement("small");
   date.textContent = String(item.date || "");

   card.append(sender, body, date);
   box.appendChild(card);
  });

  return messages;
 }catch(e){
  box.textContent = e.message;
  toast(e.message);
  return [];
 }
}

$("smsBtn").onclick = loadSms;

$("readSmsBtn").onclick = async()=>{
 const btn = $("readSmsBtn");
 btn.disabled = true;

 try{
  const messages = await loadSms();

  if(messages.length){
   const text = messages.slice(0,5).map(item=>
    "Message from " + String(item.sender || "Unknown") +
    ". " + String(item.message || "")
   ).join(". ");

   speak("Here are your recent SMS messages. " + text);
  }
 }finally{
  btn.disabled = false;
 }
};

$("weatherBtn").onclick=async()=>{
 $("weatherResult").textContent="Loading...";
 try{const r=await fetch("/api/weather?city="+encodeURIComponent($("city").value));const d=await r.json();if(!r.ok)throw Error(d.error);
 $("weatherResult").innerHTML=`<b>${d.city}, ${d.country}</b><br>🌡 ${d.temperature}°C (feels ${d.feels}°C)<br>Humidity ${d.humidity}% · Wind ${d.wind} km/h`;
 }catch(e){$("weatherResult").textContent=e.message;}
};
$("newsBtn").onclick=async()=>{
 $("newsList").textContent="Loading headlines...";
 try{const r=await fetch("/api/news");const d=await r.json();if(!r.ok)throw Error(d.error);
 $("newsList").replaceChildren();d.items.forEach(x=>{const a=document.createElement("a");a.href=x.link;a.target="_blank";a.rel="noopener";a.textContent=x.title;$("newsList").appendChild(a);});
 }catch(e){$("newsList").textContent=e.message;}
};
const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
let recognition=null;

function startCallListening(){
  if(!callActive || callBusy || speechActive || !recognition) return;
  try{
    recognition.lang="en-IN";
    recognition.start();
  }catch(e){}
}

if(SpeechRecognition){
  recognition=new SpeechRecognition();
  recognition.lang="en-IN";
  recognition.interimResults=false;

  recognition.onstart=()=>{
    window.SparkyHologram?.setState("listening");
    $("micBtn").classList.add("listening");
    $("voiceTitle").textContent=callActive ? "SPARKY CALL: Listening..." : "Listening...";
  };

  recognition.onend=()=>{
    if(!callActive) window.SparkyHologram?.setState("idle");
    $("micBtn").classList.remove("listening");
    if(callActive && !callBusy && !speechActive){
      startCallListening();
    }else if(!callActive){
      $("voiceTitle").textContent="Tap to speak";
    }
  };

  recognition.onerror=()=>{
    if(callActive) toast("Mic issue. Check browser permission.");
    else toast("Mic issue. Check browser permission and internet.");
  };

  recognition.onresult=e=>{
    const transcript=e.results[0][0].transcript;
    const command = transcript.toLowerCase().trim();

    if(
      command.includes("read my latest whatsapp") ||
      command.includes("read latest whatsapp") ||
      command.includes("read my whatsapp") ||
      command.includes("read whatsapp messages")
    ){
      fetch("/api/notifications", {headers: headers()})
        .then(r => r.json())
        .then(d => {
          const items = (d.notifications || []).filter(item =>
            String(item.app || "").toLowerCase().includes("whatsapp")
          );

          if(items.length){
            const latest = items[0];
            speak(
              "Your latest WhatsApp notification. " +
              String(latest.title || "") + ". " +
              String(latest.content || ""),
              callActive ? startCallListening : undefined
            );
          }else{
            speak(
              "No WhatsApp notification found.",
              callActive ? startCallListening : undefined
            );
          }
        })
        .catch(() => speak(
          "Could not read WhatsApp notifications.",
          callActive ? startCallListening : undefined
        ));
      return;
    }

    if(
      command.includes("read my latest sms") ||
      command.includes("read latest sms") ||
      command.includes("read my messages") ||
      command.includes("read my sms")
    ){
      loadSms().then(messages=>{
        if(messages.length){
          const latest = messages[0];
          speak(
            "Your latest SMS is from " +
            String(latest.sender || "Unknown") +
            ". " + String(latest.message || ""),
            callActive ? startCallListening : undefined
          );
        }else{
          speak("You have no SMS messages.", callActive ? startCallListening : undefined);
        }
      });
      return;
    }

    if(callActive){
      callBusy=true;
      sendMessage(transcript,true).finally(()=>{
        callBusy=false;
        if(callActive && !speechActive) startCallListening();
      });
    }else{
      sendMessage(transcript);
    }
  };
}

$("micBtn").onclick=()=>{
  if(!recognition){
    toast("Voice recognition works best in Chrome on Android.");
    return;
  }
  try{
    recognition.lang="en-IN";
    recognition.start();
  }catch(e){
    toast("Microphone is already listening.");
  }
};



let wakeMode = false;
let wakeRecognition = null;

function startWakeListening(){
  if(!wakeMode || callActive || !wakeRecognition) return;
  try { wakeRecognition.start(); } catch(e) {}
}

if(SpeechRecognition){
  wakeRecognition = new SpeechRecognition();
  wakeRecognition.lang = "en-IN";
  wakeRecognition.continuous = false;
  wakeRecognition.interimResults = false;

  wakeRecognition.onresult = e => {
    const heard = e.results[0][0].transcript.toLowerCase().trim();

    if(heard.includes("hey sparky") || heard.includes("hey sparki")){
      wakeMode = false;
      wakeRecognition.stop();

      $("wakeBtn").textContent = "🎧 HEY SPARKY: OFF";

      callActive = true;
      callBusy = false;
      $("callBtn").textContent = "🔴 END CALL";
      $("voiceTitle").textContent = "SPARKY activated!";
      $("voiceHint").textContent = "Speak naturally. Tap END CALL to stop.";

      speak("Yes, I'm listening.", startCallListening);
    }
  };

  wakeRecognition.onend = () => {
    if(wakeMode && !callActive){
      setTimeout(startWakeListening, 500);
    }
  };

  wakeRecognition.onerror = () => {
    if(wakeMode) $("voiceTitle").textContent = "Wake Word listening...";
  };
}

$("wakeBtn").onclick = () => {
  if(!wakeRecognition){
    toast("Wake Word requires Chrome on Android with microphone permission.");
    return;
  }

  if(callActive){
    toast("End SPARKY call before starting Wake Word.");
    return;
  }

  wakeMode = !wakeMode;

  if(wakeMode){
    $("wakeBtn").textContent = "🎧 HEY SPARKY: ON";
    $("voiceTitle").textContent = "Say Hey SPARKY";
    $("voiceHint").textContent = "Keep this website open in Chrome.";
    startWakeListening();
  }else{
    wakeRecognition.stop();
    $("wakeBtn").textContent = "🎧 HEY SPARKY: OFF";
    $("voiceTitle").textContent = "Wake Word disabled";
  }
};

$("callBtn").onclick=()=>{
  if(!recognition){
    toast("Voice call requires Chrome on Android with microphone permission.");
    return;
  }

  if(callActive){
    callActive=false;
    callBusy=false;
    recognition.stop();
    window.speechSynthesis.cancel();
    speechActive=false;
    $("callBtn").textContent="📞 CALL SPARKY";
    $("voiceTitle").textContent="Call ended";
    $("voiceHint").textContent="Tap CALL SPARKY to start again";
    return;
  }

  callActive=true;
  $("callBtn").textContent="🔴 END CALL";
  $("voiceTitle").textContent="Connecting to SPARKY...";
  $("voiceHint").textContent="Speak after SPARKY starts listening";
  startCallListening();
};
loadStatus();
// SPARKY attachment, camera and chat history
let selectedFiles = [];
let savedChats = JSON.parse(localStorage.getItem("sparky_chats") || "[]");

function saveChatHistory() {
  if (!history.length) return;

  savedChats = JSON.parse(localStorage.getItem("sparky_chats") || "[]");
  const last = savedChats[savedChats.length - 1];

  if (last && last.id === window.sparkyChatId) {
    last.messages = history;
  } else {
    savedChats.push({
      id: window.sparkyChatId,
      date: new Date().toLocaleString(),
      messages: history
    });
  }

  savedChats = savedChats.slice(-30);
  localStorage.setItem("sparky_chats", JSON.stringify(savedChats));
}

window.sparkyChatId = Date.now().toString();

$("attachBtn").onclick = () => $("fileInput").click();
$("cameraBtn").onclick = () => $("cameraInput").click();

function chooseFile(file) {
  if (!file) return;
  const duplicate = selectedFiles.some(
    f => f.name === file.name && f.size === file.size &&
         f.lastModified === file.lastModified
  );
  if (!duplicate) selectedFiles.push(file);

  $("attachmentPreview").textContent =
    selectedFiles.length + " file(s): " +
    selectedFiles.map(f => f.name).join(", ");
  toast("File added successfully.");
}

$("fileInput").onchange = e => {
  Array.from(e.target.files).forEach(chooseFile);
  e.target.value = "";
};
$("cameraInput").onchange = e => {
  Array.from(e.target.files).forEach(chooseFile);
  e.target.value = "";
};

$("historyBtn").onclick = () => {
  savedChats = JSON.parse(localStorage.getItem("sparky_chats") || "[]");

  if (!savedChats.length) {
    toast("No saved chat history yet.");
    return;
  }

  const choice = prompt(
    savedChats.map((c, i) => `${i + 1}. ${c.date}`).join("\n") +
    "\nEnter chat number to open:"
  );

  const index = Number(choice) - 1;
  if (!Number.isInteger(index) || !savedChats[index]) return;

  history.length = 0;
  history.push(...savedChats[index].messages);
  $("chatLog").replaceChildren();

  history.forEach(m =>
    addBubble(m.content, m.role === "user" ? "user" : "bot")
  );

  window.sparkyChatId = savedChats[index].id;
  toast("Chat history opened.");
};

// SPARKY ChatGPT-style sidebar controls
(function () {
  const menu = document.getElementById("menuBtn");
  const sidebar = document.getElementById("chatSidebar");
  const close = document.getElementById("closeSidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const newChat = document.getElementById("newChatBtn");
  const list = document.getElementById("chatHistoryList");

  if (!menu || !sidebar || !list) return;

  function closeMenu() {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
  }

  function openMenu() {
    renderChats();
    sidebar.classList.add("open");
    overlay.classList.add("show");
  }

  function renderChats() {
    const chats = JSON.parse(localStorage.getItem("sparky_chats") || "[]");
    list.replaceChildren();

    chats.slice().reverse().forEach(chat => {
      const btn = document.createElement("button");
      btn.className = "history-item";
      const first = chat.messages?.find(m => m.role === "user");
      btn.textContent = first?.content || chat.date || "New chat";

      btn.onclick = () => {
        history.length = 0;
        history.push(...(chat.messages || []));
        document.getElementById("chatLog").replaceChildren();

        history.forEach(m =>
          addBubble(m.content, m.role === "user" ? "user" : "bot")
        );

        window.sparkyChatId = chat.id;
        closeMenu();
      };

      list.appendChild(btn);
    });
  }

  menu.addEventListener("click", openMenu);
  close?.addEventListener("click", closeMenu);
  overlay?.addEventListener("click", closeMenu);

  newChat?.addEventListener("click", () => {
    history.length = 0;
    document.getElementById("chatLog").replaceChildren();
    window.sparkyChatId = Date.now().toString();
    closeMenu();
  });
})();

/* SPARKY V13 Voice Intelligence */
(function(){
 const status=document.getElementById("v13Status");
 const test=document.getElementById("v13Test");
 const wake=document.getElementById("v13Wake");
 if(!status||!test||!wake)return;
 const supported=!!(window.SpeechRecognition||window.webkitSpeechRecognition);
 status.textContent="VOICE: "+(supported?"SUPPORTED":"NOT SUPPORTED")+" | TTS: "+(window.speechSynthesis?"READY":"UNAVAILABLE");
 test.addEventListener("click",()=>{
   if(!window.speechSynthesis){status.textContent="Speech output unavailable";return;}
   speechSynthesis.cancel();
   const msg=new SpeechSynthesisUtterance("Yes, I'm listening. SPARKY voice system is ready.");
   msg.lang="en-IN";msg.rate=1;msg.pitch=0.9;
   speechSynthesis.speak(msg);
   status.textContent="JARVIS VOICE TESTING...";
 });
 wake.addEventListener("click",()=>{
   if(typeof startWakeListening==="function"){
     startWakeListening();
     status.textContent="WAKE LISTENING REQUESTED";
   }else status.textContent="Wake listener function unavailable";
 });
})();

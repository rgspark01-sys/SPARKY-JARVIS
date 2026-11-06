(() => {
  const canvas = document.getElementById("sparkyHologramCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let w=0,h=0,t=0,state="idle",mouth=0,start=Date.now();
  const particles=Array.from({length:110},()=>({a:Math.random()*6.28,r:.4+Math.random()*.6,z:Math.random()}));
  function resize(){
    const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);
    w=r.width;h=r.height;canvas.width=w*d;canvas.height=h*d;ctx.setTransform(d,0,0,d,0,0);
  }
  window.addEventListener("resize",resize);resize();
  function line(a,b,alpha=.7){
    ctx.strokeStyle=`rgba(75,225,255,${alpha})`;
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  }
  function draw(){
    t+=.016;
    ctx.clearRect(0,0,w,h);
    const cx=w/2,cy=h*.43,s=Math.min(w/300,h/390);
    ctx.save();ctx.translate(cx,cy);ctx.scale(s,s);
    const intro=Math.min(1,(Date.now()-start)/1300);
    ctx.globalAlpha=intro;
    ctx.shadowColor="#35dfff";ctx.shadowBlur=15;
    // 3D rotating orbital rings
    for(let i=0;i<4;i++){
      ctx.save();ctx.rotate(t*(i%2?-.3:.22)+i);
      ctx.strokeStyle="rgba(50,220,255,.65)";ctx.lineWidth=1;
      ctx.beginPath();ctx.ellipse(0,0,105+i*12,145+i*9,0,0,Math.PI*1.8);ctx.stroke();
      ctx.restore();
    }
    // 3D wireframe face mesh
    const rows=13,cols=17,pts=[];
    for(let j=0;j<rows;j++){
      pts[j]=[];
      const v=(j/(rows-1)-.5)*Math.PI;
      for(let i=0;i<cols;i++){
        const u=(i/(cols-1)-.5)*Math.PI;
        const x=68*Math.sin(u)*Math.cos(v);
        const y=112*Math.sin(v);
        const z=48*Math.cos(u)*Math.cos(v);
        const rot=t*.22,xx=x*Math.cos(rot)-z*Math.sin(rot),zz=x*Math.sin(rot)+z*Math.cos(rot);
        const k=300/(300+zz);
        pts[j][i]={x:xx*k,y:y*k,z:zz};
      }
    }
    ctx.lineWidth=.8;
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
      if(i<cols-1)line(pts[j][i],pts[j][i+1],.25+Math.max(0,pts[j][i].z)/150);
      if(j<rows-1)line(pts[j][i],pts[j+1][i],.3);
    }
    // Eyes and animated pupils
    for(const x of [-29,29]){
      ctx.fillStyle="#bafaff";ctx.shadowBlur=22;
      ctx.beginPath();ctx.ellipse(x,-23,12,4+Math.sin(t*2)*1.2,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#12dfff";ctx.beginPath();ctx.arc(x+Math.sin(t)*2,-23,3,0,Math.PI*2);ctx.fill();
    }
    // Mouth reacts to speaking state
    const open=state==="speaking"?3+Math.abs(Math.sin(t*12))*9:mouth*9;
    ctx.strokeStyle="#73efff";ctx.beginPath();ctx.ellipse(0,57,13,3+open,0,0,Math.PI*2);ctx.stroke();
    // Scanning beam
    ctx.save();ctx.beginPath();ctx.rect(-100,-145,200,290);ctx.clip();
    const scan=(t*55)%290-145;
    ctx.fillStyle="rgba(70,230,255,.18)";ctx.fillRect(-100,scan,200,3);ctx.restore();
    ctx.restore();
    // Holographic particles
    ctx.fillStyle="#68eaff";ctx.shadowBlur=8;
    for(const p of particles){
      const a=p.a+t*(.12+p.z*.1),r=90+p.r*75;
      ctx.globalAlpha=.2+p.z*.65;
      ctx.beginPath();ctx.arc(cx+Math.cos(a)*r,cy+Math.sin(a)*r*1.2,1+p.z*1.5,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;ctx.shadowBlur=0;
    ctx.font="12px monospace";ctx.textAlign="center";ctx.fillStyle="#65eaff";
    ctx.fillText("J.A.R.V.I.S  //  "+state.toUpperCase(),cx,h*.86);
    requestAnimationFrame(draw);
  }
  window.SparkyHologram={
    setState(s){state=s||"idle";},
    pulseMouth(v){mouth=Math.max(0,Math.min(1,Number(v)||0));}
  };
  draw();
})();

(() => {
  if (document.getElementById("jarvisBoot")) return;
  const boot = document.createElement("div");
  boot.id = "jarvisBoot";
  boot.style.cssText = "position:fixed;inset:0;z-index:99999;background:#020914;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#55eaff;font:16px monospace;letter-spacing:3px;transition:opacity .8s";
  boot.innerHTML = '<div style="font-size:clamp(28px,8vw,55px);text-shadow:0 0 25px #19cfff">J.A.R.V.I.S</div><p id="jarvisBootText">INITIALIZING SYSTEMS...</p><div style="width:65%;height:3px;background:#12334b"><div id="jarvisBootBar" style="height:100%;width:0;background:#42eaff;box-shadow:0 0 15px #42eaff"></div></div><p style="font-size:11px">SPARKY INTELLIGENCE SYSTEM</p>';
  document.body.appendChild(boot);
  const bar=document.getElementById("jarvisBootBar");
  const label=document.getElementById("jarvisBootText");
  const steps=["LOADING CORE SYSTEMS...","CONNECTING AI NETWORK...","CALIBRATING HOLOGRAM...","VOICE SYSTEM ONLINE...","ALL SYSTEMS READY"];
  let n=0;
  const timer=setInterval(()=>{
    n++;
    bar.style.width=(n*20)+"%";
    label.textContent=steps[n-1];
    if(n>=5){
      clearInterval(timer);
      setTimeout(()=>{
        boot.style.opacity="0";
        setTimeout(()=>boot.remove(),850);
      },500);
    }
  },450);
})();

(() => {
  const canvas = document.getElementById("sparkyHologramCanvas");
  if (!canvas) return;
  const panel = document.createElement("div");
  panel.id = "jarvisLiveHUD";
  panel.style.cssText = "font:11px monospace;color:#65eaff;text-align:center;letter-spacing:1px;margin:8px auto;line-height:2;text-shadow:0 0 8px #00cfff";
  panel.innerHTML = '<div>◈ JARVIS LIVE SYSTEM ◈</div><div id="jvState">AI STATUS: STANDBY</div><div id="jvBars" style="letter-spacing:4px">▰ ▰ ▰ ▰ ▰ ▰ ▰ ▰</div><div>NEURAL LINK: ACTIVE</div>';
  canvas.insertAdjacentElement("afterend", panel);
  const stateText = panel.querySelector("#jvState");
  const bars = panel.querySelector("#jvBars");
  const api = window.SparkyHologram;
  if (api && api.setState) {
    const original = api.setState.bind(api);
    api.setState = (s) => {
      original(s);
      stateText.textContent = "AI STATUS: " + String(s || "idle").toUpperCase();
    };
  }
  let n = 0;
  setInterval(() => {
    n++;
    bars.textContent = Array.from({length:8},(_,i)=>
      ((i+n)%3===0 ? "▱" : "▰")).join(" ");
  }, 300);
})();

(() => {
  const api = window.SparkyHologram;
  const panel = document.getElementById("jarvisLiveHUD");
  if (!api || !panel) return;

  let currentState = "idle";
  const original = api.setState.bind(api);

  api.setState = (state) => {
    currentState = state || "idle";
    original(currentState);
    const label = panel.querySelector("#jvState");
    if (label) label.textContent = "AI STATUS: " + currentState.toUpperCase();
  };

  const bars = panel.querySelector("#jvBars");
  function animate() {
    if (!bars || !bars.isConnected) return;
    const active = currentState === "listening" || currentState === "speaking";
    bars.textContent = Array.from({length:12}, () => {
      const level = active ? Math.random() : Math.random() * 0.25;
      return level > 0.65 ? "▰" : level > 0.3 ? "▮" : "▱";
    }).join(" ");
    requestAnimationFrame(() => setTimeout(animate, 120));
  }
  animate();
})();

(() => {
  let audioContext, analyser, micStream, frame;
  let active = false;
  const bars = document.querySelector("#jvBars");

  async function startAudioVisualizer() {
    try {
      if (active) return;
      micStream = await navigator.mediaDevices.getUserMedia({audio:true});
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      audioContext.createMediaStreamSource(micStream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      active = true;

      function update() {
        if (!active || !bars) return;
        analyser.getByteFrequencyData(data);
        bars.textContent = Array.from(data.slice(0,12), v =>
          v > 150 ? "▰" : v > 75 ? "▮" : "▱"
        ).join(" ");
        frame = requestAnimationFrame(update);
      }
      update();
    } catch (e) {
      console.warn("Microphone visualizer:", e.message);
    }
  }

  function stopAudioVisualizer() {
    active = false;
    cancelAnimationFrame(frame);
    micStream?.getTracks().forEach(track => track.stop());
    audioContext?.close();
    micStream = null;
    audioContext = null;
  }

  document.querySelector("#micBtn")?.addEventListener("click", () => {
    startAudioVisualizer();
    setTimeout(stopAudioVisualizer, 12000);
  });

  document.querySelector("#callBtn")?.addEventListener("click", () => {
    setTimeout(() => {
      const btn = document.querySelector("#callBtn");
      if (btn?.textContent.includes("END CALL")) startAudioVisualizer();
      else stopAudioVisualizer();
    }, 300);
  });
})();

(() => {
  const canvas = document.querySelector("#sparkyHologramCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let pulse = 0;
  function drawV9() {
    pulse += 0.08;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return requestAnimationFrame(drawV9);
    ctx.save();
    ctx.strokeStyle = "rgba(70,220,255,.65)";
    ctx.shadowColor = "#22dfff";
    ctx.shadowBlur = 14;
    ctx.lineWidth = 1;
    for (let i=0;i<5;i++) {
      ctx.beginPath();
      ctx.ellipse(w/2,h*.43,65+i*14,95+i*15,Math.sin(pulse)*.08,0,Math.PI*2);
      ctx.stroke();
    }
    ctx.restore();
    requestAnimationFrame(drawV9);
  }
  drawV9();
})();

(() => {
  if (document.getElementById("jarvisV10")) return;
  const hud = document.createElement("section");
  hud.id = "jarvisV10";
  hud.style.cssText = "margin:12px auto;padding:12px;border:1px solid #17617c;border-radius:12px;background:#041322;color:#67eaff;font:11px monospace;text-align:center;max-width:420px;box-shadow:0 0 18px #087c9c55";
  hud.innerHTML = '<div>◈ JARVIS SYSTEM DIAGNOSTICS ◈</div><div id="j10ai">AI CORE: CHECKING</div><div id="j10voice">VOICE: STANDBY</div><div id="j10battery">BATTERY: CHECKING</div><div id="j10clock">SYSTEM TIME: --:--:--</div>';
  const canvas = document.getElementById("sparkyHologramCanvas");
  if (canvas) canvas.insertAdjacentElement("afterend", hud);
  const update = async () => {
    const clock = document.getElementById("j10clock");
    if (clock) clock.textContent = "SYSTEM TIME: " + new Date().toLocaleTimeString();
    const ai = document.getElementById("j10ai");
    if (ai) {
      try {
        const r = await fetch("/api/health");
        ai.textContent = "AI CORE: " + (r.ok ? "ONLINE" : "CHECK");
      } catch (_) { ai.textContent = "AI CORE: OFFLINE"; }
    }
    const battery = document.getElementById("j10battery");
    if (battery && navigator.getBattery) {
      try {
        const b = await navigator.getBattery();
        battery.textContent = "BATTERY: " + Math.round(b.level * 100) + "%";
      } catch (_) { battery.textContent = "BATTERY: DEVICE DATA UNAVAILABLE"; }
    } else if (battery) battery.textContent = "BATTERY: DEVICE DATA UNAVAILABLE";
  };
  update();
  setInterval(update, 15000);
  const voice = document.getElementById("j10voice");
  document.getElementById("micBtn")?.addEventListener("click", () => {
    if (voice) voice.textContent = "VOICE: LISTENING";
    setTimeout(() => { if (voice) voice.textContent = "VOICE: STANDBY"; }, 10000);
  });
})();

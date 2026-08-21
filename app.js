// Simple Web Video Editor - app.js
const videoInput = document.getElementById('videoFile');
const imageInput = document.getElementById('imageFile');
const audioInput = document.getElementById('audioFile');

const preview = document.getElementById('preview');
const ctx = preview.getContext('2d');

const playBtn = document.getElementById('play');
const pauseBtn = document.getElementById('pause');
const exportBtn = document.getElementById('export');

const newProjectBtn = document.getElementById('newProject');
const saveProjectBtn = document.getElementById('saveProject');
const loadProjectFile = document.getElementById('loadProjectFile');
const projectNameInput = document.getElementById('projectName');

let hiddenVideo = document.createElement('video');
hiddenVideo.muted = true;
hiddenVideo.playsInline = true;
hiddenVideo.crossOrigin = "anonymous";

let imageEl = new Image();
let audioEl = document.createElement('audio');

let animationId = null;
let project = { name: '', video: null, image: null, audio: null };

function setProjectName(name){ project.name = name || 'project'; projectNameInput.value = project.name; }

newProjectBtn.addEventListener('click', () => {
  setProjectName('New Project');
  project.video = null; project.image = null; project.audio = null;
  hiddenVideo.src = ''; imageEl.src = ''; audioEl.src = '';
  drawPlaceholder();
});

videoInput.addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  hiddenVideo.src = url;
  hiddenVideo.onloadedmetadata = () => {
    // size canvas to video aspect
    const w = Math.min(960, hiddenVideo.videoWidth);
    const h = Math.round(w * (hiddenVideo.videoHeight / hiddenVideo.videoWidth));
    preview.width = w; preview.height = h;
  };
  project.video = await fileToDataURL(f);
});

imageInput.addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  imageEl.src = URL.createObjectURL(f);
  project.image = await fileToDataURL(f);
});

audioInput.addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  audioEl.src = URL.createObjectURL(f);
  project.audio = await fileToDataURL(f);
});

playBtn.addEventListener('click', async () => {
  if (!hiddenVideo.src && !imageEl.src) { alert('Add a video or image first'); return; }
  if (hiddenVideo.src) {
    await hiddenVideo.play();
  }
  try { await audioEl.play(); } catch (e) { /* autoplay restrictions might block until user interacts */ }
  startRenderLoop();
});

pauseBtn.addEventListener('click', () => {
  hiddenVideo.pause();
  audioEl.pause();
  stopRenderLoop();
});

function startRenderLoop(){
  if (animationId) return;
  function render(){
    // clear
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,preview.width,preview.height);
    // draw video frame if present
    if (hiddenVideo.src && hiddenVideo.readyState >= 2 && !hiddenVideo.paused) {
      try { ctx.drawImage(hiddenVideo, 0, 0, preview.width, preview.height); } catch(e){}
    } else if (hiddenVideo.src && hiddenVideo.readyState >=2 && hiddenVideo.paused) {
      // draw first frame
      try { ctx.drawImage(hiddenVideo, 0, 0, preview.width, preview.height); } catch(e){}
    } else {
      // placeholder
      drawPlaceholder();
    }
    // draw image overlay (centered, scaled)
    if (imageEl.src && imageEl.complete) {
      const iw = imageEl.width, ih = imageEl.height;
      const scale = Math.min(preview.width / iw, preview.height / ih, 1);
      const w = iw * scale, h = ih * scale;
      const x = (preview.width - w) / 2, y = (preview.height - h) / 2;
      ctx.drawImage(imageEl, x, y, w, h);
    }
    animationId = requestAnimationFrame(render);
  }
  render();
}

function stopRenderLoop(){
  if (animationId) cancelAnimationFrame(animationId);
  animationId = null;
}

function drawPlaceholder(){
  ctx.fillStyle = '#111'; ctx.fillRect(0,0,preview.width,preview.height);
  ctx.fillStyle = '#666'; ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Add a video or image to start', preview.width/2, preview.height/2);
}

async function fileToDataURL(file){
  return await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

// Export / Save Video using canvas stream + audio
exportBtn.addEventListener('click', async () => {
  if (!hiddenVideo.src && !imageEl.src) { alert('Add a video or image first'); return; }
  // Ensure audio and video are paused and ready to be recorded from start
  hiddenVideo.pause();
  hiddenVideo.currentTime = 0;
  audioEl.pause();
  audioEl.currentTime = 0;

  // create an audio context to capture audio into a MediaStream
  const canvasStream = preview.captureStream(30); // 30 fps
  let mixedStream = canvasStream;

  if (audioEl.src) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const sourceNode = audioCtx.createMediaElementSource(audioEl);
    const dest = audioCtx.createMediaStreamDestination();
    sourceNode.connect(dest);
    // connect to audioCtx.destination so we can hear it during preview (optional)
    // sourceNode.connect(audioCtx.destination);

    // add audio tracks to the canvas stream
    const audioTracks = dest.stream.getAudioTracks();
    audioTracks.forEach(t => mixedStream.addTrack(t));
  }

  const options = { mimeType: 'video/webm;codecs=vp8,opus' };
  let recorder;
  try {
    recorder = new MediaRecorder(mixedStream, options);
  } catch (e) {
    alert('MediaRecorder not supported or invalid mimeType in this browser.');
    return;
  }

  const chunks = [];
  recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (project.name || 'export') + '.webm';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    alert('Export complete (download should begin).');
  };

  // Start playback and recording
  try {
    await hiddenVideo.play();
  } catch (e) {}
  try {
    await audioEl.play();
  } catch (e) {}
  recorder.start();

  // Stop recorder when video ends or after audio ends (or after a timeout)
  const stopWhenDone = () => {
    if (recorder.state !== 'inactive') recorder.stop();
    hiddenVideo.pause();
    audioEl.pause();
  };

  // If there is a video element, stop when it ends
  if (hiddenVideo.src) {
    hiddenVideo.onended = stopWhenDone;
  } else if (audioEl.src) {
    audioEl.onended = stopWhenDone;
  } else {
    // No media length known — stop after 10s fallback
    setTimeout(stopWhenDone, 10000);
  }
});

// Save / Load project (stores dataURLs)
saveProjectBtn.addEventListener('click', async () => {
  const name = projectNameInput.value || 'project';
  const saved = { name, video: project.video || null, image: project.image || null, audio: project.audio || null, createdAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(saved)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (name.replace(/\s+/g,'_') || 'project') + '.json';
  document.body.appendChild(a); a.click(); a.remove();
});

loadProjectFile.addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const text = await f.text();
  try {
    const parsed = JSON.parse(text);
    project = parsed;
    setProjectName(project.name);
    if (project.video) { hiddenVideo.src = project.video; }
    if (project.image) { imageEl.src = project.image; }
    if (project.audio) { audioEl.src = project.audio; }
    alert('Project loaded. Click Play to preview.');
  } catch (err) {
    alert('Invalid project file.');
  }
});

// Initialize
setProjectName('My Project');
drawPlaceholder();

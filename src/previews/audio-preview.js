import { sharedResourceTracker } from '../utils/cleanup.js';
import { formatDuration, formatBytes } from '../utils/formatters.js';

/**
 * Compact audio player with deterministic lightweight waveform bars (never decodes huge audio files into memory).
 */
export function renderAudioPreview(container, fileRecord, blob) {
  container.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'ws-audio-player';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:12px;';
  header.innerHTML = `
    <div class="ws-dest-emoji" style="width:42px;height:42px;font-size:22px;">🎵</div>
    <div style="min-width:0;flex:1;">
      <div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
      <div style="font-size:12px;color:var(--text-secondary);">${fileRecord.extension.toUpperCase()} Audio • ${formatBytes(fileRecord.size)}</div>
    </div>
  `;
  header.querySelector('div > div > div').textContent = fileRecord.name;

  // Lightweight procedural waveform visualization derived from filename hash (zero heavy audio buffer decode)
  const wave = document.createElement('div');
  wave.className = 'ws-waveform-bars';
  const bars = [];
  let seed = fileRecord.size || 12345;
  for (let i = 0; i < 36; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const pct = 20 + (seed % 78);
    const bar = document.createElement('div');
    bar.className = 'ws-waveform-bar';
    bar.style.height = `${pct}%`;
    bars.push(bar);
    wave.appendChild(bar);
  }

  const audio = document.createElement('audio');
  const objUrl = sharedResourceTracker.acquireObjectUrl(`preview_${fileRecord.id}`, blob);
  audio.src = objUrl;
  audio.preload = 'metadata';

  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';

  const playBtn = document.createElement('button');
  playBtn.className = 'ws-btn ws-btn-primary';
  playBtn.textContent = '▶ Play';

  const timeLabel = document.createElement('span');
  timeLabel.style.cssText = 'font-size:11.5px;min-width:80px;';
  timeLabel.textContent = '0:00 / 0:00';

  const seek = document.createElement('input');
  seek.type = 'range';
  seek.min = '0';
  seek.max = '100';
  seek.value = '0';
  seek.style.cssText = 'flex:1;cursor:pointer;';

  const speedSelect = document.createElement('select');
  speedSelect.className = 'ws-btn';
  for (const r of [0.75, 1, 1.25, 1.5, 2]) {
    const o = document.createElement('option');
    o.value = String(r);
    o.textContent = `${r}x`;
    if (r === 1) o.selected = true;
    speedSelect.appendChild(o);
  }

  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });

  audio.addEventListener('play', () => { playBtn.textContent = '⏸ Pause'; });
  audio.addEventListener('pause', () => { playBtn.textContent = '▶ Play'; });
  audio.addEventListener('loadedmetadata', () => {
    timeLabel.textContent = `0:00 / ${formatDuration(audio.duration)}`;
  });

  audio.addEventListener('timeupdate', () => {
    if (audio.duration > 0) {
      const ratio = audio.currentTime / audio.duration;
      seek.value = String(ratio * 100);
      timeLabel.textContent = `${formatDuration(audio.currentTime)} / ${formatDuration(audio.duration)}`;
      const activeBars = Math.floor(ratio * bars.length);
      bars.forEach((b, idx) => {
        b.style.opacity = idx <= activeBars ? '1' : '0.38';
      });
    }
  });

  seek.addEventListener('input', (e) => {
    e.stopPropagation();
    if (audio.duration > 0) {
      audio.currentTime = (parseFloat(seek.value) / 100) * audio.duration;
    }
  });

  speedSelect.addEventListener('change', (e) => {
    e.stopPropagation();
    audio.playbackRate = parseFloat(speedSelect.value) || 1;
  });

  controls.append(playBtn, timeLabel, seek, speedSelect);
  card.append(header, wave, controls);
  container.appendChild(card);
}

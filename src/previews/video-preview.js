import { sharedResourceTracker } from '../utils/cleanup.js';
import { formatDuration } from '../utils/formatters.js';

/**
 * Custom styled HTML5 video player using the browser's native decoding engine without exposing raw unstyled browser controls.
 */
export function renderVideoPreview(container, fileRecord, blob) {
  container.innerHTML = '';

  const player = document.createElement('div');
  player.className = 'ws-video-player';

  const video = document.createElement('video');
  const objUrl = sharedResourceTracker.acquireObjectUrl(`preview_${fileRecord.id}`, blob);
  video.src = objUrl;
  video.playsInline = true;
  video.preload = 'metadata';
  video.controls = false; // Custom controls enforced

  const controls = document.createElement('div');
  controls.className = 'ws-media-custom-controls';

  const playBtn = document.createElement('button');
  playBtn.className = 'ws-btn ws-btn-primary';
  playBtn.textContent = '▶ Play';

  const timeLabel = document.createElement('span');
  timeLabel.style.cssText = 'font-size:11.5px;font-variant-numeric:tabular-nums;min-width:85px;';
  timeLabel.textContent = '0:00 / 0:00';

  const seekSlider = document.createElement('input');
  seekSlider.type = 'range';
  seekSlider.min = '0';
  seekSlider.max = '100';
  seekSlider.value = '0';
  seekSlider.style.cssText = 'flex:1;cursor:pointer;';
  seekSlider.setAttribute('aria-label', 'Seek timeline');

  const muteBtn = document.createElement('button');
  muteBtn.className = 'ws-btn';
  muteBtn.textContent = '🔊';
  muteBtn.title = 'Mute / Unmute';

  const speedSelect = document.createElement('select');
  speedSelect.className = 'ws-btn';
  speedSelect.setAttribute('aria-label', 'Playback speed');
  for (const rate of [0.5, 1, 1.25, 1.5, 2]) {
    const opt = document.createElement('option');
    opt.value = String(rate);
    opt.textContent = `${rate}x`;
    if (rate === 1) opt.selected = true;
    speedSelect.appendChild(opt);
  }

  const fsBtn = document.createElement('button');
  fsBtn.className = 'ws-btn';
  fsBtn.textContent = '⛶';
  fsBtn.title = 'Fullscreen video';

  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  });

  video.addEventListener('play', () => { playBtn.textContent = '⏸ Pause'; });
  video.addEventListener('pause', () => { playBtn.textContent = '▶ Play'; });

  video.addEventListener('loadedmetadata', () => {
    timeLabel.textContent = `0:00 / ${formatDuration(video.duration)}`;
  });

  video.addEventListener('timeupdate', () => {
    if (video.duration > 0) {
      seekSlider.value = String((video.currentTime / video.duration) * 100);
      timeLabel.textContent = `${formatDuration(video.currentTime)} / ${formatDuration(video.duration)}`;
    }
  });

  seekSlider.addEventListener('input', (e) => {
    e.stopPropagation();
    if (video.duration > 0) {
      video.currentTime = (parseFloat(seekSlider.value) / 100) * video.duration;
    }
  });

  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    video.muted = !video.muted;
    muteBtn.textContent = video.muted ? '🔇' : '🔊';
  });

  speedSelect.addEventListener('change', (e) => {
    e.stopPropagation();
    video.playbackRate = parseFloat(speedSelect.value) || 1;
  });

  fsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (player.requestFullscreen) player.requestFullscreen().catch(() => {});
  });

  video.addEventListener('error', () => {
    player.innerHTML = `<div style="padding:28px;text-align:center;color:var(--text-secondary);">🎬 Video codec in <strong>${fileRecord.name}</strong> is not natively decoded by this browser. The file remains completely intact and ready to sort.</div>`;
  });

  controls.append(playBtn, timeLabel, seekSlider, muteBtn, speedSelect, fsBtn);
  player.append(video, controls);
  container.appendChild(player);
}

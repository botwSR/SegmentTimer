import { parseYouTubeUrl } from './youtube.js';

export function parseTwitchVodUrl(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new Error('Paste a Twitch VOD link, such as https://www.twitch.tv/videos/1234567890.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port ||
      !['twitch.tv', 'www.twitch.tv', 'm.twitch.tv'].includes(url.hostname.toLowerCase())) throw new Error('Paste a Twitch VOD link from twitch.tv/videos/….');
  const match = url.pathname.match(/^\/videos\/([1-9]\d{0,19})\/?$/);
  if (!match) throw new Error('Use a Twitch VOD link: twitch.tv/videos/VIDEO_ID. Live channels and Twitch Clips are not supported.');
  return { kind: 'twitch', id: match[1], url: 'https://www.twitch.tv/videos/' + match[1] };
}

export function parseRemoteUrl(value) {
  let host;
  try { host = new URL(String(value).trim()).hostname.toLowerCase(); } catch { throw new Error('Paste a YouTube video or Twitch VOD URL.'); }
  if (['twitch.tv', 'www.twitch.tv', 'm.twitch.tv', 'clips.twitch.tv'].includes(host)) return parseTwitchVodUrl(value);
  try { return { kind: 'youtube', ...parseYouTubeUrl(value) }; }
  catch { throw new Error('Paste a YouTube video URL or a Twitch VOD link from twitch.tv/videos/….'); }
}

let apiPromise;
export function loadTwitchApi() {
  if (window.Twitch?.Player) return Promise.resolve(window.Twitch);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(fail, 20000);
    function fail() {
      clearTimeout(timeout); script.remove(); apiPromise = null;
      reject(new Error('Could not connect to Twitch. Check your internet connection or content blocker, then try again.'));
    }
    script.src = 'https://player.twitch.tv/js/embed/v1.js';
    script.onload = () => {
      if (!window.Twitch?.Player) { fail(); return; }
      clearTimeout(timeout); resolve(window.Twitch);
    };
    script.onerror = fail;
    document.head.append(script);
  });
  return apiPromise;
}

// Paused Twitch seeks can update the clock without fetching or rendering video.
// Briefly play muted to fill the new buffer, then pause and seek back within it.
export function createTwitchPreviewSeeker(player, callbacks = {}, clock = {
  now: () => Date.now(), every: fn => setInterval(fn, 80), stop: id => clearInterval(id)
}) {
  let pending = null, timer = null;
  function stop(error = null, notify = true) {
    if (!pending) return;
    const restoreMuted = pending.muted;
    pending = null;
    if (timer !== null) clock.stop(timer);
    timer = null;
    player.pause();
    player.setMuted(restoreMuted);
    if (notify) callbacks.onPending?.(false);
    if (error) callbacks.onError?.(error);
  }
  function poll() {
    if (!pending) return;
    const now = clock.now();
    if (now - pending.started >= 15000) {
      stop('Twitch could not refresh this preview. Press Play inside the player, then try seeking again.'); return;
    }
    const time = player.getCurrentTime();
    const nearTarget = Number.isFinite(time) && Math.abs(time - pending.target) < 5;
    if (pending.phase === 'settling') {
      if (now >= pending.settleAt) {
        stop();
        callbacks.onReady?.();
      }
      return;
    }
    const buffer = player.getPlaybackStats?.()?.bufferSize;
    const hasVideo = (Number.isFinite(buffer) && buffer > 0) || pending.playing;
    if (!nearTarget || !hasVideo) {
      pending.stableSince = null; return;
    }
    pending.stableSince ??= now;
    if (now - pending.stableSince < 100) return;
    pending.phase = 'settling';
    pending.settleAt = now + 160;
    player.pause();
    player.seek(pending.target);
  }
  return {
    get active() { return pending !== null; },
    seek(target) {
      const muted = pending ? pending.muted : player.getMuted();
      pending = { target, muted, started: clock.now(), phase: 'buffering', stableSince: null, playing: false };
      callbacks.onPending?.(true);
      player.setMuted(true);
      player.seek(target);
      player.play();
      if (timer === null) timer = clock.every(poll);
    },
    signalPlaying() { if (pending) pending.playing = true; },
    isMuted() { return pending ? pending.muted : player.getMuted(); },
    setMuted(muted) { if (pending) pending.muted = muted; else player.setMuted(muted); },
    cancel: () => stop(),
    destroy: () => stop(null, false)
  };
}

// Normalize Twitch's public API to the remote-player contract used by the timer.
// Twitch exposes no playback-speed setter; speed stays under its own player UI.
export function twitchControls(player, element, status = null, preview = null) {
  return {
    getIframe: () => element.querySelector('iframe'),
    getDuration: () => player.getDuration(),
    getCurrentTime: () => player.getCurrentTime(),
    getPlayerState: () => status ? status.state : player.getEnded() ? 0 : player.isPaused() ? 2 : 1,
    playVideo: () => { preview?.cancel(); if (status) status.state = 1; player.play(); },
    pauseVideo: () => { if (status) status.state = 2; if (!preview?.active) player.pause(); },
    seekTo: seconds => player.seek(seconds),
    seekPreview: seconds => { if (status) status.state = 2; if (preview) preview.seek(seconds); else player.seek(seconds); },
    isPreviewSeeking: () => !!preview?.active,
    cancelPreview: () => preview?.cancel(),
    getVolume: () => player.getVolume() * 100,
    setVolume: percent => player.setVolume(percent / 100),
    isMuted: () => preview ? preview.isMuted() : player.getMuted(),
    mute: () => preview ? preview.setMuted(true) : player.setMuted(true),
    unMute: () => preview ? preview.setMuted(false) : player.setMuted(false),
    getPlaybackRate: () => 1,
    getAvailablePlaybackRates: () => [1],
    setPlaybackRate: () => {},
    destroy: () => {
      preview?.destroy();
      try { player.pause(); } catch { /* Removal must also work before READY. */ }
      element.querySelectorAll('iframe').forEach(frame => { frame.src = 'about:blank'; frame.remove(); });
      element.remove();
    }
  };
}

let playerSerial = 0;
export function createTwitchPlayer(api, target, options) {
  target.id = 'twitch-vod-player-' + (++playerSerial);
  const player = new api.Player(target.id, {
    width: '100%', height: '100%', video: options.videoId,
    parent: [location.hostname], autoplay: false, muted: false
  });
  const status = { state: 5 };
  const preview = createTwitchPreviewSeeker(player, {
    onPending: options.onPreviewPending, onReady: options.onPreviewReady, onError: options.onPreviewError
  });
  const controls = twitchControls(player, target, status, preview);
  const events = options.events;
  player.addEventListener(api.Player.READY, () => events.onReady({ target: controls }));
  for (const [event, state] of [[api.Player.PLAY, 1], [api.Player.PLAYING, 1], [api.Player.PAUSE, 2], [api.Player.ENDED, 0]]) {
    player.addEventListener(event, () => {
      if (preview.active) {
        if (event === api.Player.PLAYING || event === api.Player.ENDED) preview.signalPlaying();
        return;
      }
      status.state = state; events.onStateChange({ data: state, target: controls });
    });
  }
  player.addEventListener(api.Player.SEEK, () => { if (!preview.active) options.onSeek?.(); });
  player.addEventListener(api.Player.PLAYBACK_BLOCKED, () => { preview.cancel(); options.onBlocked?.(); });
  return controls;
}

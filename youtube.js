export function parseYouTubeUrl(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new Error('Paste a valid YouTube video URL.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error('Paste a YouTube video URL.');
  const host = url.hostname.toLowerCase();
  let id;
  if (['youtu.be', 'www.youtu.be'].includes(host)) id = url.pathname.split('/')[1];
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
    const parts = url.pathname.split('/').filter(Boolean);
    id = parts[0] === 'watch' ? url.searchParams.get('v') : ['shorts', 'embed', 'live'].includes(parts[0]) ? parts[1] : null;
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) throw new Error('Use a YouTube watch, share, Shorts, or embed link for one video.');
  return { id, url: 'https://www.youtube.com/watch?v=' + id };
}

let apiPromise;
export function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const previous = window.onYouTubeIframeAPIReady;
    const timer = setTimeout(fail, 20000);
    function fail() {
      clearTimeout(timer); script.remove(); apiPromise = null;
      window.onYouTubeIframeAPIReady = previous;
      reject(new Error('Could not connect to YouTube. Check your internet connection or content blocker, then try again.'));
    }
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer); window.onYouTubeIframeAPIReady = previous;
      resolve(window.YT);
      if (typeof previous === 'function') previous();
    };
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = fail;
    document.head.append(script);
  });
  return apiPromise;
}

export function youtubeError(code) {
  if ([101, 150].includes(code)) return 'This video’s owner has disabled embedding. Choose another video or open a local clip.';
  if (code === 100) return 'This YouTube video is private, removed, or unavailable.';
  if (code === 153) return 'YouTube could not identify this site. Open it through the local server or a hosted website, rather than as a file.';
  return 'YouTube could not play this video. It may be restricted or unavailable in embedded players. Try another video or a local clip.';
}

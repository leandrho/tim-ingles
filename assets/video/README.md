# Closing film memory

- Original provided video: `Tim Burton's Corpse Bride_ Piano Duet.mp4` (unchanged).
- Browser-compatible excerpt: `corpse-bride-piano-memory.mp4`, H.264 video and AAC audio in a fast-start MP4 container.
- The excerpt begins at **1:01 (61 seconds)** of the original. Its local timeline begins at zero, so playback and repeats work even on servers without HTTP byte-range seeking.
- Poster: `../images/corpse-bride-memory.webp`, extracted from the provided video at 1:01.
- Grayscale and feathered edges are applied in CSS; they do not alter the source video.
- Playback starts automatically on entering the visible closing slide, without player controls, and pauses on leaving. The presentation's theme audio (including its synth fallback) stops immediately so only the film can be heard.
- The film starts with sound after normal presentation navigation. If the browser blocks unmuted autoplay on a cold deep link, it starts silently and enables sound on the next user interaction. The existing top-bar sound button controls the film on this slide, never the theme audio.
- The "Thank You!" title appears five seconds after entering, stays visible for ten seconds, then fades out. The sequence resets on each visit.
- Reduced-motion preferences show the still image instead of autoplaying and disable the title's fade transition.

// Restrict FFmpeg to direct media demuxers; do not follow playlists or container references.
const CAST_OPTIONS = ['--no-config', '--load-scripts=no', '--ytdl=no', '--access-references=no',
  '--load-unsafe-playlists=no', '--demuxer=lavf',
  '--demuxer-lavf-o=format_whitelist=[mov,matroska,webm,avi,mpegts,mpeg,mp3,flac,wav,aac,asf,flv]'];
module.exports = { CAST_OPTIONS };

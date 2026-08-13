/**
 * aurora-dlna — XML 模板与极简解析（自研，零依赖）
 * 解析端规则：禁外部实体/DTD（防 XXE），只认 local-name，容忍命名空间前缀差异。
 */
'use strict';
const zlib = require('zlib');

/* ---------------- 转义 ---------------- */
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const unesc = (s) => String(s ?? '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/* ---------------- 极简 XML 工具（仅用于 SOAP/DIDL 容错解析） ---------------- */

/** 含 DTD/DOCTYPE/ENTITY 声明直接拒绝（防 XXE） */
function rejectUnsafe(xml) {
  return /<!DOCTYPE|<!ENTITY/i.test(xml);
}

/** 按 local-name 取第一个匹配元素的文本内容：tag(xml, 'CurrentURIMetaData') */
function tag(xml, name) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, 'i');
  const m = xml.match(re);
  return m ? m[1] : null;
}

/** 取 Body 内第一个子元素的动作名（忽略前缀），如 SetAVTransportURI */
function soapAction(xml) {
  const body = tag(xml, 'Body');
  if (!body) return null;
  const m = body.match(/<(?:[\w.-]+:)?(\w+)(?:\s[^>]*)?>/);
  return m ? m[1] : null;
}

/** 取动作参数对象（仅一层，文本值已反转义） */
function soapArgs(xml, action) {
  const inner = tag(xml, action);
  const out = {};
  if (!inner) return out;
  const re = /<([\w.-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>|<([\w.-]+)(?:\s[^>]*)?\/>/g;
  let m;
  while ((m = re.exec(inner))) {
    const name = (m[1] || m[3]).split(':').pop();
    out[name] = unesc(m[2] ?? '');
  }
  return out;
}

/** DIDL-Lite 容错解析：只取展示用字段，解析失败返回空对象不拒播（规格 §10 容错） */
function parseDidl(didl) {
  if (!didl) return {};
  const title = tag(didl, 'title');
  const creator = tag(didl, 'creator');
  const cls = tag(didl, 'class');
  const resM = didl.match(/<res(?:\s[^>]*)?>/i);
  let protocolInfo = null, size = null, duration = null;
  if (resM) {
    const attrs = resM[0];
    const get = (k) => { const a = attrs.match(new RegExp(`${k}="([^"]*)"`)); return a ? a[1] : null; };
    protocolInfo = get('protocolInfo'); size = get('size'); duration = get('duration');
  }
  return {
    title: title ? unesc(title) : null,
    creator: creator ? unesc(creator) : null,
    class: cls ? unesc(cls) : null,
    protocolInfo, size, duration,
  };
}

/* ---------------- 描述文档 ---------------- */

const SERVER = 'Windows/11 UPnP/1.0 Aurora/1.0';

function deviceDesc(cfg) {
  const svc = (type, id) => `
    <service>
      <serviceType>urn:schemas-upnp-org:service:${type}:1</serviceType>
      <serviceId>urn:upnp-org:serviceId:${id}</serviceId>
      <SCPDURL>/scpd/${id.toLowerCase()}.xml</SCPDURL>
      <controlURL>/ctrl/${id.toLowerCase()}</controlURL>
      <eventSubURL>/evt/${id.toLowerCase()}</eventSubURL>
    </service>`;
  return `<?xml version="1.0" encoding="utf-8"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>
    <friendlyName>${esc(cfg.friendlyName)}</friendlyName>
    <manufacturer>Aurora</manufacturer>
    <manufacturerURL>https://aurora.local</manufacturerURL>
    <modelName>Aurora Player</modelName>
    <modelNumber>0.1</modelNumber>
    <UDN>${esc(cfg.udn)}</UDN>
    <iconList>
      <icon><mimetype>image/png</mimetype><width>48</width><height>48</height><depth>32</depth><url>/icon48.png</url></icon>
      <icon><mimetype>image/png</mimetype><width>120</width><height>120</height><depth>32</depth><url>/icon120.png</url></icon>
    </iconList>
    <serviceList>${svc('ConnectionManager', 'ConnectionManager')}${svc('AVTransport', 'AVTransport')}${svc('RenderingControl', 'RenderingControl')}
    </serviceList>
  </device>
</root>`;
}

/** SCPD：action 清单（stateVariable 从简但结构合法，真机兼容优先） */
function scpd(service) {
  const defs = {
    avtransport: {
      actions: ['SetAVTransportURI', 'SetNextAVTransportURI', 'Play', 'Pause', 'Stop', 'Seek', 'GetTransportInfo',
        'GetPositionInfo', 'GetMediaInfo', 'GetTransportSettings', 'GetCurrentTransportActions'],
      vars: ['TransportState', 'TransportStatus', 'CurrentTrackURI', 'AVTransportURI', 'CurrentTrackDuration',
        'RelativeTimePosition', 'AbsoluteTimePosition', 'CurrentPlayMode', 'CurrentTransportActions',
        'TransportPlaySpeed', 'CurrentTrack', 'TrackMetaData', 'AVTransportURIMetaData', 'CurrentMediaDuration',
        'NumberOfTracks', 'NextAVTransportURI', 'NextAVTransportURIMetaData', 'PlaybackStorageMedium', 'LastChange'],
    },
    renderingcontrol: {
      actions: ['GetVolume', 'SetVolume', 'GetMute', 'SetMute', 'ListPresets', 'SelectPreset', 'GetVolumeDBRange'],
      vars: ['Volume', 'Mute', 'PresetNameList', 'VolumeDB', 'LastChange'],
    },
    connectionmanager: {
      actions: ['GetProtocolInfo', 'GetCurrentConnectionIDs', 'GetCurrentConnectionInfo'],
      vars: ['SourceProtocolInfo', 'SinkProtocolInfo', 'CurrentConnectionIDs'],
    },
  }[service];
  const actionXml = defs.actions.map((a) => `
      <action><name>${a}</name></action>`).join('');
  const varXml = defs.vars.map((v) => `
      <stateVariable sendEvents="${v === 'LastChange' ? 'yes' : 'no'}"><name>${v}</name><dataType>string</dataType></stateVariable>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<scpd xmlns="urn:schemas-upnp-org:service-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <actionList>${actionXml}
  </actionList>
  <serviceStateTable>${varXml}
  </serviceStateTable>
</scpd>`;
}

/* ---------------- SOAP 响应 ---------------- */

function soapResp(action, service, args) {
  const inner = Object.entries(args).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action}Response xmlns:u="urn:schemas-upnp-org:service:${service}:1">${inner}</u:${action}Response>
  </s:Body>
</s:Envelope>`;
}

function soapFault(code, desc) {
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <s:Fault>
      <faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring>
      <detail><UPnPError xmlns="urn:schemas-upnp-org:control-1-0"><errorCode>${code}</errorCode><errorDescription>${esc(desc)}</errorDescription></UPnPError></detail>
    </s:Fault>
  </s:Body>
</s:Envelope>`;
}

/* ---------------- GENA LastChange ---------------- */

function lastChangeAvt(s) {
  const inner = [
    ['TransportState', s.state], ['TransportStatus', 'OK'],
    ['CurrentTrackURI', s.uri || ''], ['AVTransportURI', s.uri || ''],
    ['CurrentTrackDuration', s.durStr || '00:00:00'], ['CurrentMediaDuration', s.durStr || '00:00:00'],
    ['RelativeTimePosition', s.posStr || '00:00:00'], ['AbsoluteTimePosition', s.posStr || '00:00:00'],
    ['CurrentTrack', s.uri ? '1' : '0'], ['NumberOfTracks', s.uri ? '1' : '0'],
    ['CurrentTransportActions', s.actions || 'Play'], ['CurrentPlayMode', 'NORMAL'],
    ['TransportPlaySpeed', '1'],
  ].map(([k, v]) => `<${k} val="${esc(v)}"/>`).join('');
  return `<Event xmlns="urn:schemas-upnp-org:metadata-1-0/AVT/"><InstanceID val="0">${inner}</InstanceID></Event>`;
}

function lastChangeRc(s) {
  const inner = `<Volume val="${s.volume}"/><Mute val="${s.mute ? 1 : 0}"/>`
    + `<Volume channel="Master" val="${s.volume}"/><Mute channel="Master" val="${s.mute ? 1 : 0}"/>`;
  return `<Event xmlns="urn:schemas-upnp-org:metadata-1-0/RCS/"><InstanceID val="0">${inner}</InstanceID></Event>`;
}

function genaNotify(sid, seq, service, lastChange) {
  return `<?xml version="1.0" encoding="utf-8"?>
<e:propertyset xmlns:e="urn:schemas-upnp-org:event-1-0">
  <e:property><LastChange>${esc(lastChange)}</LastChange></e:property>
</e:propertyset>`;
}

/* ---------------- 极简 PNG 图标（运行时生成纯色圆角方块） ---------------- */

function crc32(buf) {
  let table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xFF];
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** 生成 size×size 深色底 + 白色播放三角的 PNG */
function makeIcon(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    rows.push(Buffer.from([0])); // filter: none
    const row = Buffer.alloc(size * 4);
    for (let x = 0; x < size; x++) {
      // 三角形：x ∈ [0.32s, 0.68s]，纵向对称收窄
      const fx = x / size, fy = y / size;
      const inTri = fx > 0.34 && fx < 0.68 && Math.abs(fy - 0.5) < (0.68 - fx) * 0.85;
      const o = x * 4;
      if (inTri) { row[o] = 255; row[o + 1] = 255; row[o + 2] = 255; row[o + 3] = 255; }
      else { row[o] = 20; row[o + 1] = 20; row[o + 2] = 20; row[o + 3] = 255; }
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = {
  esc, unesc, rejectUnsafe, tag, soapAction, soapArgs, parseDidl,
  deviceDesc, scpd, soapResp, soapFault, lastChangeAvt, lastChangeRc, genaNotify,
  makeIcon, SERVER,
};

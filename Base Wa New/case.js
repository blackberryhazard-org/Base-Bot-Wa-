const { writeExif } = require('./lib/StickerMaker.js');
const { fileTypeFromBuffer } = require('file-type');
const os = require('os');
const util = require('util');
const config = require('./config.json');

function isCreator(m) {
  const sender = (m.sender || '').split('@')[0];
  const owner = String(config.ownerNumber || '').replace(/[^0-9]/g, '');
  const result = sender === owner;
  return result;
}

async function executeEval(code, conn, m) {
  try {
    let result = await eval(`(async () => { return ${code} })()`);
    if (typeof result !== 'string') {
      result = util.inspect(result, { depth: 1 });
    }
    await m.reply(result);
  } catch (e) {
    await m.reply(String(e));
  }
}

async function handleCommand(conn, m, command, args, fullText, isButton) {
  const { reply } = m;
  switch (command) {
    // All Case
    
    case 'menu': {
      const menuText = `MENU BOT\n\n- .ping - Cek respon bot + info VPS\n- .sticker / .s - Buat stiker dari gambar/video (reply/url)\n- .menu - Tampilkan menu ini\n- .info - Info JID dan status pesan\n- .owner - Cek apakah kamu owner bot\n- .myjid - Tampilkan JID kamu\n- ]> <kode> - Eksekusi kode JavaScript (owner only)`;
      await reply(menuText);
      break;
    }
    
    case 'owner':
    case 'cekowner': {
      const status = isCreator(m) ? '✅ Kamu adalah OWNER bot ini' : '❌ Kamu BUKAN owner bot ini';
      const info = `JID mu: ${m.sender}\nOwner JID: ${config.ownerNumber}@s.whatsapp.net`;
      await reply(`${status}\n\n${info}`);
      break;
    }
    
    case 'myjid': {
      await reply(`JID kamu: ${m.sender}`);
      break;
    }
    
    case 'ping': {
      const start = Date.now();
      const sent = await reply('Mengukur ping...');
      const latency = Date.now() - start;
      const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
      const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
      const uptimeHours = (os.uptime() / 3600).toFixed(2);
      const cpuModel = os.cpus()[0]?.model || 'Unknown';
      const cpuCores = os.cpus().length;
      const vpsText = `DATA VPS\n- Hostname: ${os.hostname()}\n- Platform: ${os.platform()} ${os.arch()}\n- Uptime: ${uptimeHours} jam\n- RAM: ${freeMem} GB / ${totalMem} GB (Free/Total)\n- CPU: ${cpuCores} Core, ${cpuModel.substring(0, 30)}`;
      await conn.sendMessage(m.chat, { text: `Pong! ${latency} ms\n\n${vpsText}`, edit: sent.key });
      break;
    }
    
    case 'info': {
      const infoText = `INFO PESAN\n\nJID Pengirim: ${m.sender}\nJID Chat: ${m.chat}\nGrup: ${m.isGroup ? 'Ya' : 'Tidak'}\nDari Bot: ${m.fromMe ? 'Ya' : 'Tidak'}\nID Pesan: ${m.id || '-'}\nTeks: ${m.text || '-'}`;
      await reply(infoText);
      break;
    }
    
    case 'sticker':
    case 's': {
      if (!m.quoted && !args[0]) return reply('Reply gambar/video atau kirim URL dengan .sticker <url>');
      let mediaBuffer;
      if (m.quoted && (m.quoted.mtype === 'imageMessage' || m.quoted.mtype === 'videoMessage')) {
        mediaBuffer = await m.quoted.download();
      } else if (args[0] && args[0].match(/https?:\/\//)) {
        const res = await fetch(args[0]);
        mediaBuffer = Buffer.from(await res.arrayBuffer());
      } else {
        return reply('Format tidak dikenal. Reply media atau kirim URL.');
      }
      if (!mediaBuffer) return reply('Gagal mengambil media.');
      const type = await fileTypeFromBuffer(mediaBuffer);
      if (!type || (!/image/.test(type.mime) && !/video/.test(type.mime))) {
        return reply('Hanya gambar atau video yang didukung.');
      }
      await reply('Membuat stiker...');
      try {
        const stickerBuffer = await writeExif(mediaBuffer, {
          packname: 'Sticker Bot',
          author: 'Levvi',
          cropToSquare: false
        });
        await conn.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m });
      } catch (err) {
        console.error(err);
        await reply('Gagal membuat stiker: ' + err.message);
      }
      break;
    }
    
    
    default:
      return false;
  }
  return true;
}

function extractCommandFromMessage(m) {
  let body = "";
  let isButtonResponse = false;
  try {
    if (m.message) {
      if (m.message.conversation) {
        body = m.message.conversation;
      } else if (m.message.extendedTextMessage?.text) {
        body = m.message.extendedTextMessage.text;
      } else if (m.message.imageMessage?.caption) {
        body = m.message.imageMessage.caption;
      } else if (m.message.videoMessage?.caption) {
        body = m.message.videoMessage.caption;
      } else if (m.message.documentMessage?.caption) {
        body = m.message.documentMessage.caption;
      } else if (m.message.interactiveResponseMessage) {
        const inter = m.message.interactiveResponseMessage;
        if (inter.nativeFlowResponseMessage) {
          const flow = inter.nativeFlowResponseMessage;
          if (flow.paramsJson) {
            try {
              const params = JSON.parse(flow.paramsJson);
              body = params.id || params.buttonId || params.rowId || params.index || "";
            } catch {
              body = flow.name || "";
            }
          } else {
            body = flow.name || "";
          }
          isButtonResponse = true;
        } else if (inter.buttonReply) {
          body = inter.buttonReply.selectedButtonId || "";
          isButtonResponse = true;
        } else if (inter.singleSelectReply) {
          body = inter.singleSelectReply.selectedRowId || "";
          isButtonResponse = true;
        }
      } else if (m.message.templateButtonReplyMessage) {
        body = m.message.templateButtonReplyMessage.selectedId || "";
        isButtonResponse = true;
      } else if (m.message.buttonsResponseMessage) {
        body = m.message.buttonsResponseMessage.selectedButtonId || "";
        isButtonResponse = true;
      }
    }
  } catch (error) {
    console.error('Error parsing message:', error);
  }
  return { body, isButtonResponse };
}

async function processMessage(conn, m) {
  const { body, isButtonResponse } = extractCommandFromMessage(m);
  if (body) m.text = body;
  if (!body) return;
  
  if (isButtonResponse) {
    const parts = body.split(/ +/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    await handleCommand(conn, m, command, args, body, true);
    return;
  }
  
  const trimmed = body.trim();
  if (trimmed.startsWith(']>')) {
    if (!isCreator(m)) {
      await m.reply('Perintah eval hanya untuk owner.');
      return;
    }
    const evalCode = trimmed.slice(2).trim();
    if (!evalCode) {
      return m.reply('Contoh:\n]> 1+1');
    }
    await executeEval(evalCode, conn, m);
    return;
  }
  
  if (body.startsWith(config.prefix || '.')) {
    const cleanBody = body.slice(1).trim();
    const parts = cleanBody.split(/ +/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    await handleCommand(conn, m, command, args, body, false);
    return;
  }
}

module.exports = { handleCommand, processMessage, extractCommandFromMessage, isCreator, executeEval };
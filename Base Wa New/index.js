const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys')
const pino = require('pino')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const readline = require('readline')
const { smsg, makeWASocket: makeWASocketSimple, bind } = require('./lib/msg.js')
const { processMessage } = require('./case.js')

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

const question = (text) => new Promise((resolve) => rl.question(text, resolve))

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')

    const conn = makeWASocketSimple({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Safari'),
        auth: state
    })

    bind(conn)

    if (!conn.authState.creds.registered) {
        console.log("Masukkan nomor telepon (cth: 628xxxxxx):")
        const phoneNumber = await question("NUMBER: ")
        const code = await conn.requestPairingCode(phoneNumber, "L3VIC0DE")
        console.log(`KODE PAIRING: ${code}`)
    }

    conn.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            let m = chatUpdate.messages[0]
            if (!m.message) return
            if (m.key && m.key.remoteJid === 'status@broadcast') return
            if (m.key.fromMe) return
            
            m = await smsg(conn, m)
            
            await processMessage(conn, m)
        } catch (err) {
            console.error(err)
        }
    })

    conn.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update
        if (connection === 'close') {
            const shouldReconnect = new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('Connection closed, reconnecting:', shouldReconnect)
            if (shouldReconnect) {
                connectToWhatsApp()
            }
        } else if (connection === 'open') {
            console.log('✅ Connected to WhatsApp')
        }
    })

    conn.ev.on('creds.update', saveCreds)
}

connectToWhatsApp()
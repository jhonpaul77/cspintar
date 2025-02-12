const Redis = require('ioredis');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
require('dotenv').config();

// Menggunakan Redis Cloud URL yang telah diset di variabel lingkungan
const redis = new Redis(process.env.REDIS_URL);  // Pastikan Redis terhubung dengan benar

const sessions = {}; // Menyimpan koneksi bot yang aktif

// Fungsi untuk mendapatkan respons dari ChatGPT
const getChatGPTResponse = async (text) => {
    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: text }],
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Error ChatGPT:', error.response ? error.response.data : error.message);
        return 'Maaf, terjadi kesalahan saat memproses permintaan.';
    }
};

// Fungsi untuk memulai bot dan autentikasi WhatsApp Web
const startBot = async (phoneNumber) => {
    const authFolder = `sessions/auth_${phoneNumber}`;

    // Cek apakah sudah ada sesi di Redis untuk nomor ini
    const existingSession = await redis.get(`auth_${phoneNumber}`);
    const savedCreds = existingSession ? JSON.parse(existingSession) : {};

    const { state, saveCreds } = await useMultiFileAuthState(authFolder, savedCreds);

    let sock;
    try {
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false, // Menonaktifkan QR di terminal
        });

        // Menyimpan sesi di Redis
        await redis.set(`auth_${phoneNumber}`, JSON.stringify(state));

    } catch (error) {
        console.error("Gagal membuat koneksi:", error);
        return;
    }

    // Event listener untuk menangani pembaruan kredensial
    sock.ev.on('creds.update', (creds) => {
        saveCreds(creds);
        // Simpan kredensial ke Redis setelah pembaruan
        redis.set(`auth_${phoneNumber}`, JSON.stringify(creds));
    });

    sock.ev.on('connection.update', ({ connection, qr, lastDisconnect }) => {
        if (qr) {
            console.log(`📢 Scan QR untuk nomor ${phoneNumber}:`);
            qrcode.generate(qr, { small: true }); // Menampilkan QR Code di terminal
        }

        if (connection === 'open') {
            console.log(`✅ Bot ${phoneNumber} berhasil terhubung ke WhatsApp.`);
            sessions[phoneNumber] = sock; // Menyimpan socket di sessions
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log(`❌ Koneksi terputus, alasan: ${reason}, mencoba untuk menyambung kembali...`);
            startBot(phoneNumber); // Coba sambung ulang jika terputus
        }
    });

    // Menyimpan pesan masuk di Redis dan mengirim ke ChatGPT
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.key.fromMe && msg.message) {
            const sender = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

            // Mengabaikan pesan jika bukan teks atau dari grup/status broadcast
            if (!text || sender.includes('g.us') || sender === 'status@broadcast') {
                console.log(`📩 Pesan dari ${sender} diabaikan.`);
                return;
            }

            console.log(`📩 Pesan dari ${sender}: ${text}`);

            // Mengirim pesan ke ChatGPT untuk mendapatkan balasan
            const chatGPTReply = await getChatGPTResponse(text);

            // Kirim balasan ke WhatsApp
            await sendMessage(sender, chatGPTReply);

            // Simpan pesan dan balasan di Redis
            const chatHistoryKey = `chatHistory:${sender}`;
            let chatHistory = await redis.get(chatHistoryKey);
            chatHistory = chatHistory ? JSON.parse(chatHistory) : [];

            // Simpan pesan baru dan balasan dari ChatGPT
            chatHistory.push({
                messageId: msg.key.id,
                from: sender,
                message: text,
                reply: chatGPTReply,
                timestamp: new Date()
            });

            // Simpan kembali ke Redis
            await redis.set(chatHistoryKey, JSON.stringify(chatHistory));
            console.log(`Pesan dan balasan disimpan ke Redis: ${chatGPTReply}`);
        }
    });

    return sock;
};

// Fungsi untuk mengirim pesan
const sendMessage = async (phoneNumber, to, message) => {
    const sock = sessions[phoneNumber]; // Mengambil socket yang aktif
    if (!sock) {
        console.log(`Error: Bot tidak aktif untuk nomor ${phoneNumber}`);
        throw new Error('Bot tidak aktif untuk nomor ' + phoneNumber); // Bot tidak terhubung untuk nomor tersebut
    }

    // Pastikan nomor tujuan dalam format yang benar
    const validPhoneNumber = to.includes('@s.whatsapp.net') ? to : to + '@s.whatsapp.net';

    try {
        const result = await sock.sendMessage(validPhoneNumber, { text: message });
        console.log(`📤 Pesan terkirim ke ${validPhoneNumber}: ${message}`);
        
        // Simpan pesan yang dikirim di Redis
        const messageId = result.key.id; // ID pesan yang dikirim
        const chatHistoryKey = `chatHistory:${validPhoneNumber}`;

        // Ambil sejarah chat yang sudah ada, jika ada
        let chatHistory = await redis.get(chatHistoryKey);
        chatHistory = chatHistory ? JSON.parse(chatHistory) : [];

        // Tambahkan pesan baru ke chat history
        chatHistory.push({ messageId, from: phoneNumber, message, timestamp: new Date() });

        // Simpan kembali ke Redis
        await redis.set(chatHistoryKey, JSON.stringify(chatHistory));
        console.log(`Pesan disimpan ke Redis dengan ID: ${messageId}`);
        
        return result;
    } catch (error) {
        console.error('Error sending message:', error);
        throw error; // Menyebarkan error untuk ditangani di server.js
    }
};

// Ekspor fungsi
module.exports = { startBot, sendMessage };

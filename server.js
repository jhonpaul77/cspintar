const express = require('express');
const swaggerUi = require('swagger-ui-express');
const Redis = require('ioredis');
const { startBot, sendMessage, deleteSession, startBotWithPairingCode } = require('./bot');
const swaggerDocument = require('./docs/swagger.json'); // pastikan path ini benar
const cors = require('cors');

const app = express();
const port = 3000;
app.use(cors());  // Menambahkan middleware CORS ke aplikasi Express
app.use(express.json());

// Menggunakan Redis Cloud URL yang telah diset di variabel lingkungan
const redis = new Redis(process.env.REDIS_URL);  // Pastikan Redis terhubung dengan benar

// 📌 Deklarasi sessions di server.js untuk menyimpan koneksi bot
const sessions = {}; // Menyimpan koneksi bot yang aktif

// 📌 Validasi nomor telepon menggunakan regex
const isValidPhoneNumber = (phoneNumber) => {
    const regex = /^[+]*[0-9]{10,15}$/; // Memastikan nomor telepon termasuk kode negara (misalnya +62)
    return regex.test(phoneNumber);
};

// 📌 Menyimpan sesi bot di Redis untuk nomor yang terautentikasi
const startSessionsForAllNumbers = async () => {
    try {
        const allSessions = await redis.keys('auth_*'); // Mencari semua kunci yang dimulai dengan 'auth_'
        for (const sessionKey of allSessions) {
            const phoneNumber = sessionKey.split('auth_')[1]; // Mengambil nomor telepon dari key
            await startBot(phoneNumber); // Mulai sesi untuk nomor ini
        }
    } catch (error) {
        console.error("Error starting sessions:", error);
    }
};

// 📌 Menyajikan Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// 📌 Endpoint untuk memeriksa status koneksi WhatsApp
app.get('/api/status', async (req, res) => {
    const { phoneNumber } = req.query;

    // Validasi nomor telepon
    if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) {
        return res.status(400).json({ message: 'Nomor WhatsApp tidak valid!' });
    }

    // Cek apakah bot untuk nomor ini terhubung
    const sock = sessions[phoneNumber];
    if (sock) {
        return res.json({ status: 'connected' });
    } else {
        return res.json({ status: 'disconnected' });
    }
});

// 📌 API untuk memulai koneksi WhatsApp dengan QR Code
app.post('/api/start-session-qr', async (req, res) => {
    const { phoneNumber } = req.body;

    // Validasi nomor telepon
    if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) {
        return res.status(400).json({ message: 'Nomor WhatsApp tidak valid!' });
    }

    try {
        const existingBot = await startBot(phoneNumber);
        return res.json({ message: `Bot ${phoneNumber} berhasil dimulai. Scan QR di terminal!` });
    } catch (error) {
        console.error("Error starting bot:", error);
        return res.status(500).json({ message: 'Terjadi kesalahan saat memulai bot dengan QR Code', error: error.message });
    }
});

// 📌 API untuk memulai koneksi WhatsApp dengan Pairing Code
app.post('/api/start-session-pairing', async (req, res) => {
    const { phoneNumber, pairingCode } = req.body;

    // Validasi nomor telepon dan pairing code
    if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) {
        return res.status(400).json({ message: 'Nomor WhatsApp tidak valid!' });
    }

    if (!pairingCode) {
        return res.status(400).json({ message: 'Pairing Code diperlukan!' });
    }

    try {
        const existingBot = await startBotWithPairingCode(phoneNumber, pairingCode);
        return res.json({ message: `Bot ${phoneNumber} berhasil dimulai. Masukkan pairing code di WhatsApp Web.` });
    } catch (error) {
        console.error("Error starting bot with pairing code:", error);
        return res.status(500).json({ message: 'Terjadi kesalahan saat memulai bot dengan pairing code', error: error.message });
    }
});

// 📌 API untuk mengirim pesan WhatsApp berdasarkan nomor tujuan
app.post('/api/send-message', async (req, res) => {
    const { phoneNumber, to, message } = req.body;

    // Validasi input
    if (!phoneNumber || !isValidPhoneNumber(phoneNumber) || !to || !isValidPhoneNumber(to) || !message) {
        return res.status(400).json({ message: 'phoneNumber, to, dan message diperlukan dan nomor harus valid!' });
    }

    try {
        const result = await sendMessage(phoneNumber, to, message);
        return res.json(result);  // Mengembalikan hasil pengiriman pesan
    } catch (error) {
        console.error("Error sending message:", error);
        return res.status(500).json({ message: 'Terjadi kesalahan saat mengirim pesan', error: error.message });
    }
});

// Menambahkan endpoint untuk mengambil chat history
// Endpoint untuk mengambil chat history berdasarkan nomor telepon
app.get('/api/chat-history', async (req, res) => {
    const { phoneNumber } = req.query;

    // Validasi nomor telepon
    if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) {
        return res.status(400).json({ message: 'Nomor WhatsApp tidak valid!' });
    }

    try {
        const chatHistoryKey = `chatHistory:${phoneNumber}`;
        const chatHistory = await redis.get(chatHistoryKey);

        if (!chatHistory) {
            return res.status(404).json({ message: 'History chat tidak ditemukan untuk nomor tersebut.' });
        }

        return res.json(JSON.parse(chatHistory));
    } catch (error) {
        console.error("Error fetching chat history:", error);
        return res.status(500).json({ message: 'Terjadi kesalahan saat mengambil chat history', error: error.message });
    }
});

// 📌 Endpoint untuk menghapus sesi WhatsApp
app.post('/api/delete-session', async (req, res) => {
    const { phoneNumber } = req.body;

    // Validasi nomor telepon
    if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) {
        return res.status(400).json({ message: 'Nomor WhatsApp tidak valid!' });
    }

    try {
        deleteSession(phoneNumber);
        return res.json({ message: `Sesi untuk nomor ${phoneNumber} telah dihapus.` });
    } catch (error) {
        console.error("Error deleting session:", error);
        return res.status(500).json({ message: 'Terjadi kesalahan saat menghapus sesi', error: error.message });
    }
});

// Jalankan semua sesi saat server dimulai
startSessionsForAllNumbers();

// Menjalankan server Express
app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
    console.log(`Swagger Docs: http://localhost:${port}/api-docs`);
});

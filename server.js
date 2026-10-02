const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
app.use(cors());
app.use(express.json());

let currentQR = null;
let isConnected = false;
const verifiedNumbers = new Map();

async function startWhatsAppBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./session_auth');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Elaseel Store', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            currentQR = await QRCode.toDataURL(qr);
            isConnected = false;
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsAppBot();
        } else if (connection === 'open') {
            isConnected = true;
            currentQR = null;
            console.log('✅ تم اتصال البوت بنجاح برقم حلواني الأصيل!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const senderJid = msg.key.remoteJid;
        const senderPhone = senderJid.split('@')[0];
        const bodyText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        if (bodyText.includes('كود التحقق الخاص بي:')) {
            const match = bodyText.match(/\((\d{6})\)/);
            if (match) {
                const code = match[1];
                verifiedNumbers.set(senderPhone, {
                    code: code,
                    timestamp: Date.now()
                });

                await sock.sendMessage(senderJid, { 
                    text: '🧁 أهلاً بك في حلواني الأصيل! تم تأكيد وتوثيق رقمك بنجاح، وموقعنا الآن في خدمتك.' 
                });
            }
        }
    });
}

app.get('/qr', (req, res) => {
    if (isConnected) {
        return res.send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px; direction:rtl;">
                <h1 style="color:green;">✅ البوت متصل وشغال 100%!</h1>
                <p>رقم الواتساب مربوط بالسيرفر السحابي وجاهز لاستقبال وتأكيد رسائل العملاء 24 ساعة.</p>
            </div>
        `);
    }

    if (!currentQR) {
        return res.send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px; direction:rtl;">
                <h2>جاري تجهيز كود QR...</h2>
                <p>يرجى الانتظار 5 ثوانٍ، الصفحة تحدث تلقائياً.</p>
                <script>setTimeout(() => location.reload(), 4000);</script>
            </div>
        `);
    }

    res.send(`
        <div style="font-family:sans-serif; text-align:center; padding:30px; direction:rtl;">
            <h2>امسح كود الـ QR من تطبيق الواتساب</h2>
            <p>افتح الواتساب > الأجهزة المرتبطة (Linked Devices) > ربط جهاز</p>
            <div style="margin:20px 0;">
                <img src="${currentQR}" style="width:280px; border:1px solid #ccc; border-radius:12px; padding:10px;" />
            </div>
            <script>setTimeout(() => location.reload(), 15000);</script>
        </div>
    `);
});

app.get('/api/check-verification', (req, res) => {
    let phone = req.query.phone || '';
    if (phone.startsWith('01')) phone = '2' + phone;
    phone = phone.replace(/[^0-9]/g, '');

    if (verifiedNumbers.has(phone)) {
        res.json({ verified: true, data: verifiedNumbers.get(phone) });
    } else {
        res.json({ verified: false });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startWhatsAppBot();
});

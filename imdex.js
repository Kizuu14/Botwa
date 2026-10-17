const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    downloadContentFromMessage 
} = require('@whiskeysockets/baileys');
const ffmpeg = require('fluent-ffmpeg');
const yts = require('yt-search');
const fs = require('fs');
const { exec } = require('child_process');
const readline = require('readline');
const axios = require('axios');

const SIDER_FILE = './sider_data.json';
const POINT_FILE = './point_data.json';

let userActivity = {}; 
let gameSession = {}; 
let userPoints = {}; 

// Load Data Sider
if (fs.existsSync(SIDER_FILE)) {
    try { userActivity = JSON.parse(fs.readFileSync(SIDER_FILE)); } catch (e) { userActivity = {}; }
}
function saveActivity() {
    fs.writeFileSync(SIDER_FILE, JSON.stringify(userActivity, null, 2));
}

// Load Data Poin
if (fs.existsSync(POINT_FILE)) {
    try { userPoints = JSON.parse(fs.readFileSync(POINT_FILE)); } catch (e) { userPoints = {}; }
}
function savePoints() {
    fs.writeFileSync(POINT_FILE, JSON.stringify(userPoints, null, 2));
}

// Fungsi Poin Per-Grup
function addPoint(from, sender, amount = 10) {
    userPoints[from] = userPoints[from] || {};
    userPoints[from][sender] = (userPoints[from][sender] || 0) + amount;
    savePoints();
    return userPoints[from][sender];
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_wa');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: require('pino')({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'connecting' && !sock.authState.creds.registered) {
            setTimeout(async () => {
                const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                const question = (text) => new Promise((resolve) => rl.question(text, resolve));
                
                console.log('\n=======================================');
                const phoneNumber = await question('Masukkan Nomor WA Bot (Contoh: 6281234567890): ');
                try {
                    const code = await sock.requestPairingCode(phoneNumber.trim());
                    console.log(`\n👉 KODE PAIRING KAMU: ${code}`);
                    console.log('=======================================\n');
                } catch (err) {
                    console.log('Gagal mengambil kode pairing, coba jalankan ulang script.');
                }
                rl.close();
            }, 3000);
        }

        if (connection === 'open') {
            console.log('✅ Bot WhatsApp Berhasil Terhubung!');
        } else if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        }
    });

    sock.ev.on('group-participants.update', async (num) => {
        const { id, participants, action } = num;
        for (let p of participants) {
            const jid = typeof p === 'string' ? p : p.id;
            if (!jid) continue;

            if (action === 'add') {
                await sock.sendMessage(id, { 
                    text: `Selamat datang @${jid.split('@')[0]}! Jangan lupa baca deskripsi grup ya.`, 
                    mentions: [jid] 
                });
            } else if (action === 'remove') {
                await sock.sendMessage(id, { 
                    text: `Selamat tinggal @${jid.split('@')[0]} 👋`, 
                    mentions: [jid] 
                });
            }
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || from;
        const type = Object.keys(msg.message)[0];
        
        userActivity[from] = userActivity[from] || {};
        userActivity[from][sender] = Date.now();
        saveActivity();

        const body = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     msg.message.imageMessage?.caption || '';

        // FITUR UTAMA: Menu Bot
        if (body === '!menu' || body === '/menu' || body === '!help') {
            const menuText = `✨ *Daftar Menu Bot WhatsApp* ✨

🤖 *ARTIFICIAL INTELLIGENCE (AI)*
  ├ *!ai <pertanyaan>*
  │  └ Tanya jawab otomatis dengan AI pintar.
  └ *!draw* / *!gambar <deskripsi>*
     └ Bikin gambar otomatis lewat AI.

🛠 *MEDIA & TOOL*
  ├ *!sticker* / *!stiker*
  │  └ Kirim/reply gambar untuk bikin stiker.
  ├ *!lagu <judul>*
  │  └ Cari dan download lagu MP3.
  ├ *!tt <link tiktok>*
  │  └ Download video TikTok tanpa watermark.
  └ *!ciduk*
     └ Reply foto/video "Sekali Lihat" (View Once).

👥 *FITUR GRUP*
  ├ *!cek-sider*
  │  └ Cek member grup yang tidak aktif 3 hari.
  └ *!hidetag <pesan>*
     └ Tag semua member grup secara tersembunyi.

🎮 *MINI GAMES & POIN*
  ├ *!tebakkata* / *!susunkata*
  │  └ Kuis tebak kata dari clue/soal kocak.
  ├ *!tebakangka*
  │  └ Game tebak angka 1 - 10.
  ├ *!poin* / *!me*
  │  └ Cek poin kamu khusus di grup ini.
  ├ *!top* / *!leaderboard*
  │  └ Cek 5 pemain poin tertinggi di grup ini.
  └ *!nyerah*
     └ Menyerah dan lihat jawaban game.

📌 _Poin terpisah di tiap grup demi keadilan bersama!_`;

            return await sock.sendMessage(from, { text: menuText });
        }

        // FITUR AI 1: Tanya Jawab (!ai)
        if (body.startsWith('!ai ')) {
            const prompt = body.replace('!ai ', '').trim();
            if (!prompt) {
                return await sock.sendMessage(from, { text: '❌ Masukkan pertanyaanmu! Contoh: *!ai Siapa kamu?*' });
            }

            await sock.sendMessage(from, { text: '🤖 AI sedang berpikir...' });

            try {
                // Menggunakan API Blackbox AI publik yang super cepat & stabil
                const response = await axios.post('https://www.blackbox.ai/api/chat', {
                    messages: [{ id: '1', content: prompt, role: 'user' }],
                    id: '1',
                    previewToken: null,
                    userId: null,
                    codeModelMode: false,
                    agentMode: {},
                    trendingAgentMode: {},
                    isQueryImportant: true,
                    isForcedModelSwitch: false
                });

                const replyText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

                if (replyText) {
                    await sock.sendMessage(from, { text: `🤖 *AI Response:*\n\n${replyText}` });
                } else {
                    await sock.sendMessage(from, { text: '❌ AI tidak memberikan balasan.' });
                }
            } catch (e) {
                console.error(e.message);
                await sock.sendMessage(from, { text: '❌ Layanan AI sedang tidak merespon.' });
            }
        }

        // FITUR AI 2: Generate Gambar (!draw / !gambar)
        if (body.startsWith('!draw ') || body.startsWith('!gambar ')) {
            const prompt = body.replace('!draw ', '').replace('!gambar ', '').trim();
            if (!prompt) {
                return await sock.sendMessage(from, { text: '❌ Masukkan deskripsi gambar! Contoh: *!draw kucing astronot*' });
            }

            await sock.sendMessage(from, { text: '🎨 Sedang membuat gambar AI...' });

            try {
                const imageUrl = `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=512&height=512&seed=${Math.floor(Math.random() * 1000)}`;
                
                // Download gambarnya dulu ke Buffer biar WA tidak loading/kosong
                const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                const imgBuffer = Buffer.from(imgRes.data, 'binary');

                await sock.sendMessage(from, { 
                    image: imgBuffer, 
                    caption: `🎨 *Hasil Gambar AI*\nPrompt: _${prompt}_` 
                });
            } catch (e) {
                console.error(e.message);
                await sock.sendMessage(from, { text: '❌ Gagal membuat/mengunduh gambar AI.' });
            }
        }

        // FITUR CEK POIN SAYA PER-GRUP (!poin / !me)
        if (body === '!poin' || body === '!me') {
            const myPoint = userPoints[from]?.[sender] || 0;
            return await sock.sendMessage(from, { 
                text: `👤 @${sender.split('@')[0]}\n⭐ Total Poin Kamu di Grup Ini: *${myPoint} Poin*`,
                mentions: [sender]
            });
        }

        // FITUR LEADERBOARD PER-GRUP (!top / !leaderboard)
        if (body === '!top' || body === '!leaderboard') {
            const groupPts = userPoints[from] || {};
            const sorted = Object.entries(groupPts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5);

            if (sorted.length === 0) {
                return await sock.sendMessage(from, { text: '🏆 Belum ada yang memiliki poin di grup ini. Yuk mainkan *!tebakkata*!' });
            }

            let text = `🏆 *KLASEMEN TOP 5 PEMAIN GRUP* 🏆\n\n`;
            let mentions = [];
            sorted.forEach(([jid, pts], i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🎗️';
                text += `${medal} ${i + 1}. @${jid.split('@')[0]} - *${pts} Poin*\n`;
                mentions.push(jid);
            });

            return await sock.sendMessage(from, { text: text, mentions: mentions });
        }

        // FITUR 1: Pembuat Stiker (!sticker)
        if (body.startsWith('!sticker') || body.startsWith('!stiker')) {
            const isImage = type === 'imageMessage';
            const isQuotedImage = type === 'extendedTextMessage' && msg.message.extendedTextMessage.contextInfo?.quotedMessage?.imageMessage;

            if (isImage || isQuotedImage) {
                await sock.sendMessage(from, { text: '⏳ Lagi bikin stiker...' });
                
                const targetMsg = isImage ? msg.message.imageMessage : msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
                const stream = await downloadContentFromMessage(targetMsg, 'image');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                const tempIn = `./temp_${Date.now()}.jpg`;
                const tempOut = `./temp_${Date.now()}.webp`;
                fs.writeFileSync(tempIn, buffer);

                ffmpeg(tempIn)
                    .outputOptions(['-vcodec libwebp', '-vf scale=512:512:force_original_aspect_ratio=increase,crop=512:512'])
                    .toFormat('webp')
                    .save(tempOut)
                    .on('end', async () => {
                        await sock.sendMessage(from, { sticker: fs.readFileSync(tempOut) });
                        if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
                        if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
                    })
                    .on('error', async (err) => {
                        console.error(err);
                        await sock.sendMessage(from, { text: '❌ Gagal membuat stiker.' });
                    });
            } else {
                await sock.sendMessage(from, { text: 'Kirim/reply gambar dengan caption *!sticker*' });
            }
        }

        // FITUR 2: Cari Lagu (!lagu)
        if (body.startsWith('!lagu ')) {
            const query = body.replace('!lagu ', '');
            await sock.sendMessage(from, { text: `🔍 Mencari lagu: *${query}*...` });

            try {
                const search = await yts(query);
                if (!search.videos.length) {
                    return sock.sendMessage(from, { text: 'Lagu tidak ditemukan.' });
                }

                const video = search.videos[0];
                if (video.seconds > 600) { 
                    return sock.sendMessage(from, { text: '❌ Lagunya kepanjangan (lebih dari 10 menit)! File kebesaran dan bakal ditolak.' });
                }

                await sock.sendMessage(from, { text: `🎵 Memproses: *${video.title}*\nDurasi: ${video.timestamp}` });

                const tempAudio = `./music_${Date.now()}.mp3`;

                exec(`yt-dlp -x --audio-format mp3 -o "${tempAudio}" "${video.url}"`, async (error) => {
                    if (error) {
                        console.error(error);
                        return sock.sendMessage(from, { text: '❌ Gagal mengunduh audio (kemungkinan pembatasan usia/hak cipta).' });
                    }

                    if (fs.existsSync(tempAudio)) {
                        await sock.sendMessage(from, { 
                            audio: fs.readFileSync(tempAudio), 
                            mimetype: 'audio/mpeg',
                            fileName: `${video.title}.mp3`
                        });
                        fs.unlinkSync(tempAudio);
                    }
                });
            } catch (e) {
                console.error(e);
                await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat mencari lagu.' });
            }
        }

        // FITUR 3: Cek Sider (!cek-sider)
        if (body === '!cek-sider' && from.endsWith('@g.us')) {
            const groupMetadata = await sock.groupMetadata(from);
            const members = groupMetadata.participants;
            const now = Date.now();
            const batasHari = 3 * 24 * 60 * 60 * 1000; 

            let siderList = [];
            const botNumber = sock.user.id.split(':')[0].split('@')[0];

            for (let member of members) {
                const memberJid = member.id || member;
                if (memberJid.startsWith(botNumber)) continue;

                const lastSeen = userActivity[from]?.[memberJid];

                if (!lastSeen) {
                    siderList.push({ jid: memberJid, status: 'belum pernah chat sejak bot aktif' });
                } else if (now - lastSeen > batasHari) {
                    const selisihHari = Math.floor((now - lastSeen) / (1000 * 60 * 60 * 24));
                    siderList.push({ jid: memberJid, status: `tidak aktif ${selisihHari} hari` });
                }
            }

            if (siderList.length === 0) {
                return await sock.sendMessage(from, { text: '✅ Mantap, semua member grup aktif terus nih!' });
            }

            let teks = `⚠️ *Member Tidak Aktif*\n\n`;
            let mentions = [];

            siderList.forEach((item, i) => {
                teks += `${i + 1}. @${item.jid.split('@')[0]} (${item.status})\n`;
                mentions.push(item.jid);
            });

            teks += `\n🚨 *Peringatan:* Buat nama-nama yang ke-tag di atas, tolong diramaikan lagi ya grupnya! Jangan cuma baca doang atau jadi pajangan. Yuk aktif lagi! 🔥`;
            
            await sock.sendMessage(from, { text: teks, mentions: mentions });
        }

        // FITUR 4: Download TikTok (!tt)
        if (body.startsWith('!tt ')) {
            const url = body.replace('!tt ', '').trim();
            await sock.sendMessage(from, { text: '⏳ Mengunduh video TikTok...' });

            try {
                const tempVideo = `./tt_${Date.now()}.mp4`;
                exec(`yt-dlp -o "${tempVideo}" "${url}"`, async (error) => {
                    if (error) {
                        console.error(error);
                        return sock.sendMessage(from, { text: '❌ Gagal mengunduh video TikTok.' });
                    }
                    if (fs.existsSync(tempVideo)) {
                        await sock.sendMessage(from, { video: fs.readFileSync(tempVideo), caption: '✨ Nih videonya!' });
                        fs.unlinkSync(tempVideo);
                    }
                });
            } catch (e) {
                console.error(e);
                await sock.sendMessage(from, { text: '❌ Terjadi kesalahan.' });
            }
        }

        // FITUR 5: Hidetag (!hidetag)
        if (body.startsWith('!hidetag ') && from.endsWith('@g.us')) {
            const pesan = body.replace('!hidetag ', '');
            const groupMetadata = await sock.groupMetadata(from);
            const members = groupMetadata.participants.map(m => m.id);

            await sock.sendMessage(from, { text: pesan, mentions: members });
        }

        // FITUR 6: Ciduk View Once (!ciduk)
        if (body === '!ciduk') {
            const isQuoted = type === 'extendedTextMessage' && msg.message.extendedTextMessage.contextInfo?.quotedMessage;
            
            if (isQuoted) {
                const quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
                
                let innerMsg = quotedMsg.viewOnceMessageV2?.message || 
                               quotedMsg.viewOnceMessageV2Extension?.message || 
                               quotedMsg.viewOnceMessage?.message;
                
                if (!innerMsg && (quotedMsg.imageMessage?.viewOnce || quotedMsg.videoMessage?.viewOnce)) {
                    innerMsg = quotedMsg;
                }

                if (innerMsg) {
                    await sock.sendMessage(from, { text: '⏳ Membuka media rahasia...' });
                    
                    const messageType = innerMsg.imageMessage ? 'imageMessage' : (innerMsg.videoMessage ? 'videoMessage' : null);
                    
                    if (messageType) {
                        try {
                            const stream = await downloadContentFromMessage(innerMsg[messageType], messageType === 'imageMessage' ? 'image' : 'video');
                            let buffer = Buffer.from([]);
                            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                            const caption = innerMsg[messageType].caption || '';
                            
                            if (messageType === 'imageMessage') {
                                await sock.sendMessage(from, { image: buffer, caption: `📸 *Terciduk!*\n${caption}` });
                            } else {
                                await sock.sendMessage(from, { video: buffer, caption: `🎥 *Terciduk!*\n${caption}` });
                            }
                        } catch (err) {
                            await sock.sendMessage(from, { text: '❌ Gagal mendownload media. Cache mungkin sudah dihapus.' });
                        }
                    } else {
                        await sock.sendMessage(from, { text: '❌ Format media tidak didukung (bukan foto/video).' });
                    }
                } else {
                    await sock.sendMessage(from, { text: '❌ Pesan ini tidak terdeteksi sebagai "Sekali Lihat" oleh sistem.' });
                }
            } else {
                await sock.sendMessage(from, { text: '❌ Reply pesan "Sekali Lihat" dengan perintah *!ciduk*' });
            }
        }

        // FITUR GAME 1: Tebak Angka (!tebakangka)
        if (body === '!tebakangka') {
            if (gameSession[from]) return await sock.sendMessage(from, { text: '❌ Masih ada game yang berjalan di chat/grup ini!' });

            const targetNumber = Math.floor(Math.random() * 10) + 1;
            gameSession[from] = {
                type: 'tebakangka',
                answer: targetNumber.toString(),
                attempts: 3
            };

            return await sock.sendMessage(from, { 
                text: '🎮 *GAME TEBAK ANGKA*\nAku sudah memilih angka dari *1 sampai 10*.\nKamu punya 3 kali kesempatan! Ketik angkamu langsung di chat.' 
            });
        }

        // FITUR GAME 2: Tebak Kata (!tebakkata / !susunkata)
        if (body === '!tebakkata' || body === '!susunkata') {
            if (gameSession[from]) return await sock.sendMessage(from, { text: '❌ Masih ada game yang berjalan di chat/grup ini!' });

            const questions = [
                { answer: 'TEDDY', question: 'Pendamping Presiden Prabowo' },
                { answer: 'FEMBOY', question: 'Laki-laki dengan sifat feminim' },
                { answer: 'TITUT', question: 'Bocah dengan gigi ompong' },
                { answer: 'WIBUKU', question: 'Aplikasi nonton anime terkenal' },
                { answer: 'PRABOWO', question: 'Presiden paling pintar di Indonesia' },
                { answer: 'RUDEUS', question: 'Foto profil Rafi' },
                { answer: 'KEYARU', question: 'MC anime tentang healer' },
                { answer: 'SEII', question: 'Orang paling ngeselin di gc' },
                { answer: 'MBG', question: 'Kalimat andalan karbit' },
                { answer: 'TENSURA', question: 'Anime tentang slime' },
                { answer: 'TOBI', question: 'Karakter bertopeng di anime Naruto' },
                { answer: 'EMEL', question: 'Game mobile 5vs5' },
                { answer: 'GENSHIN', question: 'Game kikir' },
                { answer: 'EPEP', question: 'Game burik' },
                { answer: 'NEKOPOI', question: 'Aplikasi streaming anime haram' },
                { answer: 'KIRITO', question: 'Karakter anime yang tidak bisa log-out dari game' },
                { answer: 'AMERIKA', question: 'Admin bumi' },
                { answer: 'SPONGEBOB', question: 'Kartun dengan segudang sticker' },
                { answer: 'HIMMEL', question: 'Karakter pahlawan legendaris dengan kata-katanya' },
                { answer: 'EREN', question: 'Rumbling' },
                { answer: 'RENGOKU', question: 'Donatnya anime Kimetsu no Yaiba' },
                { answer: 'TELKOMSEL', question: 'Aplikasi iblis' },
                { answer: 'KAORI', question: 'Cicaknya anime' },
                { answer: 'KOMI', question: 'Kodoknya anime' },
                { answer: 'REM', question: 'Koma dua season' },
                { answer: 'SAWIT', question: 'Tanaman kesukaan Prabowo' },
                { answer: 'DENIS', question: 'Karakter animasi Indonesia yang paling dibenci' },
                { answer: 'MINECRAFT', question: 'Game kotak' },
                { answer: 'CHITOGE', question: 'Gorilanya anime' },
                { answer: 'ANOTHER', question: 'Anime dengan adegan tangga dan payung' }
            ];

            const selected = questions[Math.floor(Math.random() * questions.length)];

            gameSession[from] = {
                type: 'tebakkata',
                answer: selected.answer
            };

            return await sock.sendMessage(from, { 
                text: `❓ *KUIS TEBAK KATA*\n\nPertanyaan: *${selected.question}*\n\nKetik jawabanmu langsung di chat!` 
            });
        }

        // PENANGANAN JAWABAN GAME OTOMATIS + POIN PER-GRUP
        if (gameSession[from]) {
            const currentGame = gameSession[from];
            const userAnswer = body.trim().toUpperCase();

            // Jawaban Tebak Angka
            if (currentGame.type === 'tebakangka') {
                if (/^\d+$/.test(userAnswer)) {
                    if (userAnswer === currentGame.answer) {
                        delete gameSession[from];
                        const totalPts = addPoint(from, sender, 10);
                        return await sock.sendMessage(from, { 
                            text: `🎉 *TEPAT BANGET!* @${sender.split('@')[0]} Jawabannya memang angka *${userAnswer}*!\n✨ Kamu mendapatkan *+10 Poin* (Total di grup ini: ${totalPts} Poin)`,
                            mentions: [sender]
                        });
                    } else {
                        currentGame.attempts -= 1;
                        if (currentGame.attempts <= 0) {
                            const correct = currentGame.answer;
                            delete gameSession[from];
                            return await sock.sendMessage(from, { text: `💥 *GAME OVER!* Kesempatan habis. Jawabannya adalah *${correct}*.` });
                        } else {
                            return await sock.sendMessage(from, { text: `❌ Salah! Sisa kesempatan: ${currentGame.attempts} kali lagi.` });
                        }
                    }
                }
            }

            // Jawaban Tebak Kata
            if (currentGame.type === 'tebakkata') {
                if (userAnswer === currentGame.answer) {
                    delete gameSession[from];
                    const totalPts = addPoint(from, sender, 10);
                    return await sock.sendMessage(from, { 
                        text: `🎉 *BENAR!* @${sender.split('@')[0]} Jawabannya adalah *${userAnswer}*!\n✨ Kamu mendapatkan *+10 Poin* (Total di grup ini: ${totalPts} Poin)`,
                        mentions: [sender]
                    });
                }
            }
        }

        // Perintah Membatalkan Game
        if (body === '!nyerah' && gameSession[from]) {
            const ans = gameSession[from].answer;
            delete gameSession[from];
            return await sock.sendMessage(from, { text: `🏳️ Kamu menyerah! Jawabannya adalah: *${ans}*` });
        }

    });
}

startBot();

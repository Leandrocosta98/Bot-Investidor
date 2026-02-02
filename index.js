const session = require('express-session');
const express = require('express');
const path = require('path');
const app = express();

// 1. Configurações de leitura de dados e Sessão
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'Previdencia-Garantida', 
    resave: false,
    saveUninitialized: true
}));

// 2. Função de proteção
function verificarLogin(req, res, next) {
    if (req.session.logado) {
        return next(); // Se estiver logado, segue o baile
    } else {
        res.redirect('/login.html'); // Se não, chute para o login
    }
}

// 3. Rota de LOGIN (Precisa vir antes da proteção para você conseguir acessar a página de login!)
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
    const { usuario, senha } = req.body;
    if (usuario === 'admin' && senha === '1234') {
        req.session.logado = true;
        res.redirect('/'); 
    } else {
        res.send('<h1>❌ Acesso Negado!</h1><a href="/login.html">Tentar novamente</a>');
    }
});

// 4. Rota da DASHBOARD (Agora protegida)
app.get('/', verificarLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 5. Arquivos estáticos (CSS, imagens) - COLOCADOS POR ÚLTIMO
// Isso impede que o index.html seja entregue automaticamente sem passar pelo verificarLogin
app.use(express.static('public'));

// --- DAQUI PARA BAIXO SEGUE O RESTANTE DO SEU CÓDIGO (BOT, SQLITE, ETC) ---

require('dotenv').config();

const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');


const TOKEN = process.env.TELEGRAM_TOKEN;
const BRAPI_TOKEN = process.env.BRAPI_TOKEN;
console.log("Meu token carregado é:",BRAPI_TOKEN);

const bot = new TelegramBot(TOKEN, { polling: true });

async function iniciarApp() {
    const db = await open({
        filename: './database.db',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS watchlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chatId TEXT,
            ticker TEXT,
            precoBase REAL,
            limiteQueda REAL
        )
    `);

    console.log("✅ Banco de dados Pronto!");
    console.log("🚀 Seu parceiro de investimento foi iniciado!");

    
    bot.onText(/\/monitorar (.+) (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const ticker = match[1].toUpperCase();
        const quedaAlvo = parseFloat(match[2]);

        bot.sendMessage(chatId, `🔍 Buscando preço atual de ${ticker}...`);

        try {
            const url = `https://brapi.dev/api/quote/${ticker}?token=${BRAPI_TOKEN}`;
            const res = await axios.get(url);
            const precoBase = res.data.results[0].regularMarketPrice;

            await db.run(
                `INSERT INTO watchlist (chatId, ticker, precoBase, limiteQueda) VALUES (?, ?, ?, ?)`,
                [chatId, ticker, precoBase, quedaAlvo / 100]
            );

            bot.sendMessage(chatId, `✅ Monitorando ${ticker}!\n💰 Preço base: R$ ${precoBase}\n📉 Alerta em: -${quedaAlvo}%`);

        } catch (error) {
            console.log("Erro na API:", error.message);
            bot.sendMessage(chatId, `❌ Erro: Não encontrei a ação ${ticker}.`);
        }
    });

    
    bot.onText(/\/lista/, async (msg) => {
        const chatId = msg.chat.id;
        const acoes = await db.all(`SELECT * FROM watchlist WHERE chatId = ?`, [chatId]);

        if (acoes.length === 0) {
            bot.sendMessage(chatId, "📋 Sua lista no banco de dados está vazia.");
            return;
        }

        let resposta = "📋 *Ações sendo vigiadas pelo banco:*\n\n";
        acoes.forEach((acao, index) => {
            resposta += `${index + 1}. 📈 *${acao.ticker}*\n`;
            resposta += `💰 Preço Base: R$ ${acao.precoBase}\n`;

            const precoAlvo = acao.precoBase * (1 - acao.limiteQueda)

            resposta +=`✅ Alerta se cair para: R$ ${precoAlvo.toFixed(2)}\n\n`;
            
        });

        bot.sendMessage(chatId, resposta, { parse_mode: 'Markdown' });
    });

    
    bot.onText(/\/limpar/, async (msg) => {
        await db.run(`DELETE FROM watchlist WHERE chatId = ?`, [msg.chat.id]);
        bot.sendMessage(msg.chat.id, "🧹 Lista limpa no banco de dados com sucesso!");
    });

    
    async function verificarWatchlist() {
        console.log(`🔄 [${new Date().toLocaleTimeString()}] Checando preços no banco...`);
        const acoes = await db.all(`SELECT * FROM watchlist`);

        for (const acao of acoes) {
            try {
                
                const url = `https://brapi.dev/api/quote/${acao.ticker}?token=${BRAPI_TOKEN}`;
                const res = await axios.get(url);
                const precoAtual = res.data.results[0].regularMarketPrice;

                const quedaReal = (acao.precoBase - precoAtual) / acao.precoBase;
                const alvo = acao.precoBase * (1 - acao.limiteQueda);

               if (precoAtual <= alvo) {
                const mensagem = `🚨 *ALERTA DE OPORTUNIDADE*: *${acao.ticker}*\n\nO preço caiu para *R$ ${precoAtual}*!\nLimite definido: R$ ${alvo.toFixed(2)}`;
                
                await bot.sendMessage(acao.chatId, mensagem, { parse_mode: 'Markdown' });
                
                await db.run(`DELETE FROM watchlist WHERE id = ?`, [acao.id]);
                console.log(`✅ Alerta enviado para ${acao.ticker}`);
            }
            } catch (e) {
                console.log(`❌ Erro ao checar ${acao.ticker}: ${e.message}`);
            }
        }
    }

    setInterval(verificarWatchlist, 300000);
}

const PORT = process.env.PORT || 3000;
app.post('/login', (req, res) => {
    const { usuario, senha } = req.body;

    if (usuario === 'admin' && senha === '1234') {
        req.session.logado = true; // Damos o carimbo aqui!
        res.redirect('/'); 
    } else {
        res.send('<h1>❌ Acesso Negado!</h1><a href="/login.html">Tentar novamente</a>');
    }
});

app.listen(PORT,() => {
    console.log(`Site rodando na porta ${PORT}`);
});



iniciarApp().catch(err => console.error("Erro ao iniciar bot:", err));
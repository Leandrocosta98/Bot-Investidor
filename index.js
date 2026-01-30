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


iniciarApp().catch(err => console.error("Erro ao iniciar bot:", err));
/*-------BANCO DE DADOS------*/
const adicionarAtivo = async (db, { chatId, ticker, precoBase, quedaAlvo, usuarioId}) => {
 const sql = `INSERT INTO watchlist (chatId, ticker, precoBase, limiteQueda, usuario_id) 
                 VALUES (?, ?, ?, ?, ?)`;
    return await db.run(sql,
        `INSERT INTO watchlist (chatID, ticker, precoBase, limiteQueda, usuarioID) VALUES (?, ?, ?, ?, ?)`,
        [chatId, ticker, precoBase, quedaAlvo / 100, usuarioId]
    );
};

module.exports = {adicionarAtivo};
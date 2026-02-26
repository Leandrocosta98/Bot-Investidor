 // 1. Variável global para controlar a instância do gráfico
let chartInstancia = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log("Tentando carregar dados...");
    
    // Chama a função da tabela direto
    carregarDados();

    // Busca o nome, mas sem redirecionar se der erro
    fetch('/api/dados-usuario')
        .then(res => {
            console.log("Status da resposta do usuário:", res.status);
            if (!res.ok) throw new Error("Não foi possível pegar o nome");
            return res.json();
        })
        .then(data => {
            if (data.nome) {
                document.getElementById('bem-vindo').innerText = `Olá, ${data.nome}! 👋`;
            }
        })
        .catch(err => {
            console.warn("Erro ao buscar nome (provável falta de sessão):", err);
            window.location.href = "/login"; 
        });
});

// 2. Função para carregar o gráfico (Global)
async function carregarGrafico(ticker) {
    console.log("Chamando gráfico para:", ticker);
    try {
        const res = await fetch(`/api/historico/${ticker}`);
        const data = await res.json();
            
        if (!data.results || !data.results[0].historicalDataPrice) {
            alert("Dados históricos não encontrados para este ativo.");
            return;
        }

        const historico = data.results[0].historicalDataPrice;
        // Formata as datas para DD/MM
        const labels = historico.map(d => {
            const dataObj = new Date(d.date * 1000);
            return dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        });

        const precos = historico.map(d => d.close);

        const ctx = document.getElementById('meuGrafico').getContext('2d');
            
        // Destrói o gráfico anterior antes de criar um novo
        if (chartInstancia) { 
            chartInstancia.destroy(); 
        }

        chartInstancia = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `Preço de Fechamento - ${ticker}`,
                    data: precos,
                    borderColor: '#2ecc71',
                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3
                }]
            },
                
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: false }
                }
            }
        });

    } 
    catch (e) {
        console.error("Erro ao carregar gráfico:", e);
    }

}

// 3. Função para carregar os dados da tabela
async function carregarDados() {
    const tbody = document.getElementById('corpo-tabela');
    if (!tbody) {
        console.error("Erro: elemento 'corpo-tabela' não encontrado no HTML");
        return;
    }

    try {
        // Usar apenas '/api/dados' sem o http://localhost:3000
        const resposta = await fetch('/api/dados');
        if (!resposta.ok) throw new Error("Erro na requisição");
        
        const dados = await resposta.json();

        tbody.innerHTML = ""; 

        if (dados.length === 0) {
            tbody.innerHTML = "<tr><td colspan='4'>Nenhum ativo monitorado.</td></tr>";
            return;
        }

        dados.forEach(acao => {
            const precoAlvo = acao.precoBase * (1 - acao.limiteQueda);
            const porcentagemExibicao = (acao.limiteQueda * 100).toFixed(0);
            const row = `
                <tr>
                    <td>
                        <strong onclick="carregarGrafico('${acao.ticker}')" style="cursor:pointer; color:#3498db;">
                            ${acao.ticker}
                        </strong>
                    </td>
                    <td>R$ ${acao.precoBase.toFixed(2)}</td>
                    <td>R$ ${precoAlvo.toFixed(2)} (${porcentagemExibicao}%)</td>
                    <td>
                        <button onclick="deletarAtivo(${acao.id})">🗑️</button>
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        });

        if (dados.length > 0) carregarGrafico(dados[0].ticker);

    } catch (error) {
        console.error("Erro ao carregar tabela:", error);
    }
}

// 4. Função para deletar ativo (Precisa estar aqui também)
async function deletarAtivo(id) {
    if (confirm("Deseja remover este ativo?")) {
        const res = await fetch(`/api/deletar/${id}`, { method: 'DELETE' });
        if (res.ok) carregarDados();
    }
}

// Garante que tudo carregue na ordem certa
ocument.addEventListener('DOMContentLoaded', () => {
    console.log("Iniciando Dashboard...");
    
    // Primeiro tentamos carregar os dados (que agora estão sem a trava do verificarLogin no index.js)
    carregarDados();

    // Depois buscamos o nome do usuário
    fetch('/api/dados-usuario')
        .then(res => {
            if (!res.ok) {
                console.warn("Sessão não encontrada no servidor.");
                return { nome: "Visitante" };
            }
            return res.json();
        })
        .then(data => {
            if (data.nome) {
                const welcomeEl = document.getElementById('bem-vindo');
                if (welcomeEl) welcomeEl.innerText = `Olá, ${data.nome}! 👋`;
            }
        })
        .catch(err => console.error("Erro ao buscar nome:", err));
});
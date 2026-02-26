document.addEventListener('DOMContentLoaded', () => {
    const cadastroForm = document.getElementById('cadastroForm');

    // Só prossegue se encontrar o formulário na página
    if (cadastroForm) {
        cadastroForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Pega os valores dos campos
            const nome = document.getElementById('nome').value;
            const email = document.getElementById('email').value;
            const senha = document.getElementById('senha').value;

            try {
                const response = await fetch('/api/cadastro', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nome, email, senha })
                });

                const data = await response.json();

                if (response.ok) {
                    alert("✅ Conta criada com sucesso!");
                    window.location.href = "/login";
                } else {
                    alert("❌ Erro: " + (data.erro || "Não foi possível cadastrar."));
                }
            } catch (error) {
                console.error("Erro na requisição:", error);
                alert("⚠️ Erro ao conectar com o servidor.");
            }
        });
    } else {
        console.error("Erro: Formulário 'cadastroForm' não encontrado no HTML.");
    }
});
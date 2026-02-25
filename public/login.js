// Espera o HTML carregar totalmente antes de rodar o JS
document.addEventListener('DOMContentLoaded', () => {
    
    const loginForm = document.getElementById('loginForm');

    // Verifica se o formulário realmente existe na página
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const senha = document.getElementById('password').value; // Verifique se o ID no HTML é 'password' ou 'senha'

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, senha })
                });

                const data = await response.json();

                if (response.ok) {
                    alert("✅ Login realizado com sucesso!");
                    window.location.href = "/"; 
                } else {
                    alert("❌ " + (data.erro || "Usuário ou senha inválidos"));
                }
            } catch (error) {
                console.error("Erro:", error);
            }
        });
    }
});